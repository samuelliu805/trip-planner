export const clientGuides = [
  {
    name: "Codex",
    guide: "codex mcp add trip-planner --url MCP_URL\ncodex mcp login trip-planner",
    docs: "https://developers.openai.com/codex/mcp/",
    status: "Pending real-client acceptance",
  },
  {
    name: "ChatGPT",
    guide:
      "Open ChatGPT Plugins, select +, then Add custom MCP server. Enter the MCP URL, choose OAuth with dynamic registration, create and install the plugin, then review permissions in your browser.",
    docs: "https://platform.openai.com/docs/guides/developer-mode",
    status: "Pending real-client acceptance",
  },
  {
    name: "Claude Code",
    guide:
      "claude mcp add --transport http trip-planner MCP_URL\nThen open /mcp and authenticate in your browser.",
    docs: "https://code.claude.com/docs/en/mcp",
    status: "Pending real-client acceptance",
  },
  {
    name: "Claude web / Desktop",
    guide:
      "Use a custom connector when your account provides it. Enter the remote MCP URL and complete browser authorization.",
    docs: "https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp",
    status: "Pending real-client acceptance",
  },
  {
    name: "豆包工作桌面端",
    guide:
      "Remote Streamable HTTP and OAuth support must be checked in the installed version before connecting. No compatibility claim has been made.",
    docs: "https://www.doubao.com/",
    status: "Pending real-client acceptance",
  },
];
