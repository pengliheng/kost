import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as Koa from "koa";
import * as Router from "koa-router";
import * as FileServer from "koa-static";
import * as mount from "koa-mount";
import * as bodyParser from "koa-bodyparser";
import * as yaml from "js-yaml";
import { Container } from "typedi";

import Controller, { Controller$ } from "./controller";
import Service, { Service$ } from "./service";
import Middleware, { Middleware$, resolveMiddleware } from "./middleware";
import { Config$, BodyParserConfig$ } from "./config";
import Context from "./context";

export interface Application$ {
  start(config: Config$): Promise<any>;
}

class Application implements Application$ {
  private app = new Koa();
  async start(startOptions: Config$ = {}) {
    const cwd = process.cwd();
    const configDir = path.join(cwd, "configs");
    const controllerDir = path.join(cwd, "controllers");
    const serviceDir = path.join(cwd, "services");
    const staticDir = path.join(cwd, "static");
    const controllerFiles = fs.readdirSync(controllerDir);
    const serviceFiles = fs.readdirSync(serviceDir);

    const app = this.app;

    // create global context
    const context = Container.get(Context);

    // load default config
    const defaultConfig = yaml.safeLoad(
      fs.readFileSync(path.join(configDir, "default.yaml"), "utf8")
    );

    // load env config
    const envConfig = yaml.safeLoad(
      fs.readFileSync(
        path.join(configDir, process.env.NODE_ENV + ".yaml"),
        "utf8"
      )
    );

    const config: any = Object.assign(defaultConfig, envConfig);

    // set context;
    context.config = config;
    context.params = startOptions;

    // enabled some feat
    if (startOptions.enabled) {
      const { bodyParser, proxy } = startOptions.enabled;
      const staticServer = startOptions.enabled.static;
      // body parser
      if (bodyParser) {
        let bodyParserConfig: BodyParserConfig$ = {};

        // 如果传入一个Object
        if (bodyParser !== true) {
          bodyParserConfig = bodyParser;
        }
        app.use(require("koa-bodyparser")(bodyParserConfig));
      }

      // enable the build in feature
      if (staticServer) {
        app.use(
          mount(staticServer.mount, FileServer(staticDir, staticServer.options))
        );
      }

      if (proxy) {
        const proxyServer = require("koa-proxies");
        const options = proxy.options;

        // if not set rewrite
        if (!options.rewrite) {
          options.rewrite = path =>
            path.replace(new RegExp("^\\" + proxy.mount), "/");
        }

        app.use(proxyServer(proxy.mount, proxy.options));
      }
    }

    // init service
    const services: Service$[] = serviceFiles
      .filter(
        serviceFile => [".js", ".ts"].indexOf(path.extname(serviceFile)) >= 0
      )
      .map(serviceFile => {
        const filePath: string = path.join(serviceDir, serviceFile);
        let ServiceFactory = require(filePath);
        ServiceFactory = ServiceFactory.default
          ? ServiceFactory.default
          : Service;
        const service = <Service$>Container.get(ServiceFactory);
        if (service instanceof Service === false) {
          throw new Error(`The file ${filePath} is not a service file.`);
        }
        return service;
      })
      .sort((a: Service$) => -a.level);

    while (services.length) {
      const service = services.shift();
      if (service) {
        await service.init(this);
      }
    }

    const controllers: Controller$[] = [];

    // load controller
    while (controllerFiles.length) {
      const controllerFile = controllerFiles.shift();

      if (controllerFile) {
        switch (path.extname(controllerFile)) {
          case ".js":
          case ".ts":
            const filePath: string = path.join(controllerDir, controllerFile);
            let YourController = require(filePath);
            YourController = YourController.default
              ? YourController.default
              : YourController;

            const ctrl: Controller$ = Container.get(YourController);

            if (ctrl instanceof Controller === false) {
              throw new Error(`The file ${filePath} is not a controller file.`);
            }

            controllers.push(ctrl);
            break;
          default:
            break;
        }
      }
    }

    const router = new Router();

    // resolve controller
    for (let controller of controllers) {
      for (let i = 0; i < controller.router.length; i++) {
        const route = controller.router[i];
        const handler = controller[route.handler];

        // get the middleware for this route
        const middlewares = (controller.middleware || [])
          .filter(v => v.handler === route.handler)
          .map(m => {
            const middleware = new m.factory();
            middleware.config = m.options;
            return middleware;
          });

        router[route.method](
          route.path,
          ...middlewares.map(m => m.pipe.bind(m)), // middleware
          async (ctx, next) => handler.call(controller, ctx, next)
        );
      }
    }

    app.use(router.routes()).use(router.allowedMethods());

    return app.listen(3000);
  }
  use(middlewareName: string, options = {}) {
    const app = this.app;
    const MiddlewareFactory = resolveMiddleware(middlewareName);

    const middleware: Middleware$ = new MiddlewareFactory();

    // if middleware is not inherit from Middleware
    if (middleware instanceof Middleware === false) {
      throw new Error(`Invalid middleware "${middlewareName}"`);
    }

    // set context and config for middleware
    middleware.config = options;

    app.use(middleware.pipe.bind(middleware));

    return this;
  }
}

export default Application;
