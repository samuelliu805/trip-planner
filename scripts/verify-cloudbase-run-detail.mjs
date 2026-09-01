import { readFile } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";

const failureMessage = "CloudBase Run detail verification failed.\n";

function parseFirstJsonObject(input) {
  const text = stripVTControlCharacters(input);
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("{", cursor);
    if (start === -1) break;

    let depth = 0;
    let escaped = false;
    let inString = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          let payload = null;
          try {
            payload = JSON.parse(text.slice(start, index + 1));
          } catch {
            payload = null;
          }
          if (payload && typeof payload === "object" && !Array.isArray(payload)) {
            return payload;
          }
          cursor = index + 1;
          break;
        }
      }
    }

    if (depth > 0) break;
  }

  throw new Error();
}

async function main() {
  const path = process.argv[2];
  const expectedServiceName = process.argv[3];
  if (!path || !/^[A-Za-z0-9-]+$/.test(expectedServiceName ?? "")) {
    throw new Error();
  }

  const payload = parseFirstJsonObject(await readFile(path, "utf8"));
  const baseInfo = payload?.data?.BaseInfo;
  if (!baseInfo || typeof baseInfo !== "object" || Array.isArray(baseInfo)) {
    throw new Error();
  }
  if (baseInfo.ServerName !== expectedServiceName) {
    throw new Error();
  }
  if (typeof baseInfo.Status !== "string" || baseInfo.Status.toLowerCase() !== "normal") {
    throw new Error();
  }

  process.stdout.write(`CloudBase Run service ${expectedServiceName} reports Status=normal.\n`);
}

main().catch(() => {
  process.stderr.write(failureMessage);
  process.exitCode = 1;
});
