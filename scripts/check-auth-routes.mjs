const baseUrl = new URL(process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000");
const region = process.env.APP_REGION === "cn" ? "cn" : "global";

const routes =
  region === "cn"
    ? [
        {
          forbidden: ["Continue with Google", 'id="credential"', 'id="password"'],
          markers: ["欢迎回来", 'id="phone"', "发送验证码"],
          pathname: "/login",
        },
        {
          forbidden: ["Continue with Google", 'id="credential"', 'id="password"'],
          markers: ["创建账户", 'id="phone"', "发送验证码"],
          pathname: "/signup",
        },
      ]
    : [
        { forbidden: [], markers: ["Welcome back", "Continue with Google"], pathname: "/login" },
        {
          forbidden: [],
          markers: ["Create your account", "Continue with Google", "Email address"],
          pathname: "/signup",
        },
      ];

const failures = [];

for (const { forbidden, markers, pathname } of routes) {
  const url = new URL(pathname, baseUrl);

  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();

    if (
      response.status !== 200 ||
      markers.some((marker) => !body.includes(marker)) ||
      forbidden.some((marker) => body.includes(marker))
    ) {
      failures.push(
        `${pathname}: expected 200 with ${markers.map(JSON.stringify).join(" and ")}, received ${response.status}`,
      );
      continue;
    }

    console.log(`${pathname}: 200 (${markers.join(", ")})`);
  } catch (error) {
    failures.push(`${pathname}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error("Public auth route smoke check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error(
    "If only '/' works, stop the stale dev server and restart `npm run dev`; do not trust its cached App Router tree.",
  );
  process.exitCode = 1;
} else {
  console.log(`Public auth routes are healthy at ${baseUrl.origin}.`);
}
