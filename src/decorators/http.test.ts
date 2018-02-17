import test from "ava";

import * as path from "path";
import { GET, POST, PUT, DELETE, HEAD, PATCH, ALL } from "./http";
import Controller, { ControllerFactory$ } from "../controller";

const originCwd = process.cwd();

test("http decorator", async t => {
  let Factory: ControllerFactory$;
  t.notThrows(function() {
    class HomeController extends Controller {
      @GET("/index")
      async index(ctx, next) {
        ctx.body = "hello kost";
      }
    }
    Factory = HomeController;
  });

  const ctrl = new Factory();

  t.deepEqual(ctrl.router.length, 1);
  t.deepEqual(ctrl.router, [
    {
      path: "/index",
      method: "get",
      handler: "index"
    }
  ]);
});

test("http decorator in customer controller should throw an error", async t => {
  let Factory: ControllerFactory$;
  t.throws(function() {
    class HomeController {
      router = [];
      middleware = [];
      @POST("/index")
      @PUT("/index")
      @DELETE("/index")
      @HEAD("/index")
      @PATCH("/index")
      @ALL("/index")
      async index(ctx, next) {
        ctx.body = "hello kost";
      }
    }
    Factory = HomeController;
  });
});
