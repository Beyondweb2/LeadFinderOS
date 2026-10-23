import { onRequestGet as __a__slug__ts_onRequestGet } from "C:\\Users\\paulj\\LeadFinderOS\\functions\\a\\[slug].ts"
import { onRequestGet as __r__slug__ts_onRequestGet } from "C:\\Users\\paulj\\LeadFinderOS\\functions\\r\\[slug].ts"

export const routes = [
    {
      routePath: "/a/:slug",
      mountPath: "/a",
      method: "GET",
      middlewares: [],
      modules: [__a__slug__ts_onRequestGet],
    },
  {
      routePath: "/r/:slug",
      mountPath: "/r",
      method: "GET",
      middlewares: [],
      modules: [__r__slug__ts_onRequestGet],
    },
  ]