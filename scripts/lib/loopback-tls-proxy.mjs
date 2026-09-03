import { execFile } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);

function validatedUpstream(value) {
  const upstream = new URL(value);
  if (
    upstream.protocol !== "http:" ||
    !loopbackHostnames.has(upstream.hostname) ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== "/" ||
    upstream.search ||
    upstream.hash
  ) {
    throw new Error("The browser TLS proxy upstream must be a root loopback HTTP URL.");
  }
  return upstream;
}

function validatedBrowserHostname(value) {
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(value) || !value.includes(".")) {
    throw new Error("The browser TLS proxy requires a valid fixed hostname.");
  }
  return value;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function proxyHeaders(request, browserHostname) {
  const headers = { ...request.headers };
  delete headers.connection;
  delete headers["proxy-connection"];
  delete headers["transfer-encoding"];
  delete headers.upgrade;
  headers.host = request.headers.host ?? browserHostname;
  headers["x-forwarded-host"] = headers.host;
  headers["x-forwarded-proto"] = "https";
  if (request.method === "POST" && headers.origin) {
    try {
      const origin = new URL(headers.origin);
      if (origin.protocol === "https:" && origin.hostname === browserHostname) {
        // The TLS listener uses an ephemeral loopback port, while the approved deployment origin
        // does not. Next strips its action marker before this proxy sees some production-form POSTs,
        // so normalize every trusted same-origin POST. Foreign origins and non-POST requests remain
        // untouched for the application to reject normally.
        headers.host = browserHostname;
        headers["x-forwarded-host"] = browserHostname;
        headers.origin = `https://${browserHostname}`;
      }
    } catch {
      // Leave an invalid or foreign Origin untouched so the application rejects it.
    }
  }
  return headers;
}

/**
 * Give the exact-SHA production server a loopback-only HTTPS origin whose hostname matches the
 * approved AMap browser-key allowlist. This keeps production Secure-cookie behavior intact while
 * the CI browser connects only to the local server.
 */
export async function startLoopbackTlsProxy({ browserHostname, upstreamBaseUrl }) {
  const upstream = validatedUpstream(upstreamBaseUrl);
  const hostname = validatedBrowserHostname(browserHostname);
  const certificateDirectory = await mkdtemp(join(tmpdir(), "trip-phase5-tls-"));
  const certificatePath = join(certificateDirectory, "certificate.pem");
  const keyPath = join(certificateDirectory, "key.pem");
  let server;

  try {
    await execFileAsync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        `/CN=${hostname}`,
        "-keyout",
        keyPath,
        "-out",
        certificatePath,
      ],
      { maxBuffer: 64 * 1024, timeout: 15_000 },
    );
    const [certificate, key] = await Promise.all([readFile(certificatePath), readFile(keyPath)]);
    server = createHttpsServer({ cert: certificate, key }, (request, response) => {
      if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Invalid local proxy request.");
        return;
      }
      const upstreamRequest = httpRequest(
        {
          headers: proxyHeaders(request, hostname),
          hostname: upstream.hostname,
          method: request.method,
          path: request.url,
          port: upstream.port,
          protocol: upstream.protocol,
          timeout: 30_000,
        },
        (upstreamResponse) => {
          const responseHeaders = { ...upstreamResponse.headers };
          delete responseHeaders.connection;
          delete responseHeaders["transfer-encoding"];
          response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
          upstreamResponse.pipe(response);
        },
      );
      upstreamRequest.once("timeout", () =>
        upstreamRequest.destroy(new Error("Local proxy upstream timed out.")),
      );
      upstreamRequest.once("error", () => {
        if (!response.headersSent) {
          response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        }
        response.end("Local proxy upstream failed.");
      });
      request.pipe(upstreamRequest);
    });
    server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("The browser TLS proxy did not expose a loopback port.");
    }
    return {
      browserBaseUrl: `https://${hostname}:${address.port}/`,
      close: async () => {
        await closeServer(server);
        await rm(certificateDirectory, { force: true, recursive: true });
      },
    };
  } catch (error) {
    if (server?.listening) await closeServer(server);
    await rm(certificateDirectory, { force: true, recursive: true });
    throw error;
  }
}
