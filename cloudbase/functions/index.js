"use strict";

exports.main = async (...args) => {
  const cleanup = await import("./cleanup/index.mjs");
  return cleanup.main(...args);
};
