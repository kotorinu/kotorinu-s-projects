import "server-only";
import { RedisJsonStore } from "../server/redisJsonStore";
import { redisCredentials } from "../server/redisClient";
import { decodeWork } from "./model";
import { decodeExecution } from "./execution";
export function executionStore() {
  const c = redisCredentials();
  return c ? new RedisJsonStore(c.url, c.token, "work:execution:v1", decodeExecution) : null;
}
export function workStore() {
  const c = redisCredentials();
  return c ? new RedisJsonStore(c.url, c.token, "work:core:v1", decodeWork) : null;
}
