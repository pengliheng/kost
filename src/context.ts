import * as proxyServer from "http-proxy";
import * as Koa from "koa";

import { Controller$ } from "./controller";
import { Middleware$ } from "./middleware";

import { Config$ } from "./config";

export interface Context$ {
  env: NodeJS.ProcessEnv;
  config: any;
  params: Config$;
}

let haveInit: boolean = false;

export default class Context implements Context$ {
  config: any; // 加载的配置文件
  params: Config$; // 启动参数
  constructor() {
    if (haveInit) {
      throw new Error(
        "The context have been init, please inject instead of new Context()"
      );
    } else {
      haveInit = true;
    }
  }
  get env(): NodeJS.ProcessEnv {
    return process.env;
  }
}
