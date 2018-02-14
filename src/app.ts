import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as Koa from "koa";
import * as Router from "koa-router";
import * as FileServer from "koa-static";
import * as mount from "koa-mount";
import * as proxyServer from "http-proxy";
import { Container } from "typedi";

import Controller, { Controller$ } from "./controller";
import Service, { Service$ } from "./service";

interface ProxyConfig$ extends proxyServer.ServerOptions {
  rewrite?(path: string): string;
  cookieDomainRewrite?: boolean;
  logs?: boolean;
}

interface Config$ {
  cluster: number;
  enabled: {
    static?: {
      mount: string;
      options?: {
        maxage?: number;
        hidden?: boolean;
        index?: string;
        defer?: boolean;
        gzip?: boolean;
        br?: boolean;
        setHeaders(res: any, path: string, stats: any): any;
        extensions?: boolean;
      };
    };
    proxy?: {
      mount: string;
      options: ProxyConfig$;
    };
  };
}

interface AppService$ {
  [name: string]: any;
}

export interface App$ {
  service: AppService$;
  start(config: Config$): Promise<any>;
}

class App implements App$ {
  private app = new Koa();
  private controllers: Controller$[] = [];
  public service: AppService$ = {};
  async start(config: Config$) {
    const cwd = process.cwd();
    const controllerDir = path.join(cwd, "controllers");
    const serviceDir = path.join(cwd, "services");
    const staticDir = path.join(cwd, "static");
    const controllerFiles = fs.readdirSync(controllerDir);
    const serviceFiles = fs.readdirSync(serviceDir);

    // enable the build in feature
    if (config.enabled.static) {
      this.app.use(
        mount(
          config.enabled.static.mount,
          FileServer(staticDir, config.enabled.static.options)
        )
      );
    }

    if (config.enabled.proxy) {
      const proxyServer = require("koa-proxies");
      const proxy = config.enabled.proxy;
      const options = proxy.options;

      // if not set rewrite
      if (!options.rewrite) {
        options.rewrite = path =>
          path.replace(new RegExp("^\\" + proxy.mount), "/");
      }

      this.app.use(proxyServer(proxy.mount, proxy.options));
    }

    // init service
    const services: Service$[] = serviceFiles
      .filter(
        serviceFile => [".js", ".ts"].indexOf(path.extname(serviceFile)) >= 0
      )
      .map(serviceFile => {
        const filePath: string = path.join(serviceDir, serviceFile);
        let YourService = require(filePath);
        YourService = YourService.default ? YourService.default : Service;
        const service = <Service$>Container.get(YourService);
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

            ctrl.app = this;
            this.controllers.push(ctrl);
            break;
          default:
            break;
        }
      }
    }

    const router = new Router();

    // resolve controller
    for (let controller of this.controllers) {
      for (let urlPath in controller.paths) {
        const methods = controller.paths[urlPath];
        for (let httpMethod in methods) {
          const handler = controller[methods[httpMethod]];
          router[httpMethod.toLocaleLowerCase()](urlPath, async (ctx, next) =>
            handler.call(controller, ctx, next)
          );
        }
      }
    }

    this.app.use(router.routes()).use(router.allowedMethods());

    return this.app.listen(3000);
  }
  use(middlewareName: string, options = {}) {
    // TODO: 查找对应的中间件(优先从本地查找，然后到node_modules)

    // 加载对应的中间件
    // this.app.use()

    return this;
  }
}

export default App;
