"use client";

import {
  PublicAttachmentsTrigger,
  PublicItemDetailsPanel,
} from "../../components/public-resources-panel";

import { useEffect, useRef, type ReactNode } from "react";

import { LanguageSwitcher } from "@/features/i18n/language-switcher";

import { publicTemplatePlatformParts } from "../parts/platform-parts";
import type {
  CompiledPublicTemplateV1,
  PublicTemplateLayoutNodeV1,
  PublicTemplateRegionNodeV1,
} from "../schema";
import { usePublicTemplateController } from "./controller";

function TemplateRegion({
  children,
  node,
}: {
  children: ReactNode;
  node: PublicTemplateRegionNodeV1;
}) {
  const { mapVisible, shellRef, showMap, split } = usePublicTemplateController();
  const data = { "data-tp-region": node.name };
  if (node.name === "header")
    return (
      <header {...data} className="public-itinerary-header">
        <div className="public-header-row">{children}</div>
      </header>
    );
  if (node.name === "workspace")
    return (
      <div
        {...data}
        className={`public-itinerary-grid min-h-0 flex-1 ${mapVisible && showMap ? "has-map" : "map-collapsed"}`}
        ref={shellRef}
        style={
          {
            "--public-content-split": `${split}fr`,
            "--public-map-split": `${100 - split}fr`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    );
  if (node.name === "content")
    return (
      <div {...data} className="public-content-pane min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
    );
  if (node.name === "header-actions")
    return (
      <div {...data} className="public-template-region-header-actions public-header-actions">
        {children}
        <PublicAttachmentsTrigger />
        <LanguageSwitcher className="public-header-button px-2" />
      </div>
    );
  return (
    <div {...data} className={`public-template-region public-template-region-${node.name}`}>
      {children}
    </div>
  );
}

function TemplateNode({ node }: { node: PublicTemplateLayoutNodeV1 }) {
  if (node.type === "region")
    return (
      <TemplateRegion node={node}>
        {node.children.map((child, index) => (
          <TemplateNode key={`${child.type}:${child.name}:${index}`} node={child} />
        ))}
      </TemplateRegion>
    );
  const Part = publicTemplatePlatformParts[node.name as keyof typeof publicTemplatePlatformParts];
  if (!Part) return null;
  return (
    <div className="public-template-part-host" data-tp-part={node.name}>
      <Part />
    </div>
  );
}

export function PublicTemplateRenderer({ template }: { template: CompiledPublicTemplateV1 }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    // Server HTML can be visible before its buttons have client event handlers.
    // Browser verification waits for this commit signal rather than a guessed delay.
    root.current?.setAttribute("data-public-reader-ready", "true");
  }, []);
  return (
    <main
      ref={root}
      className={`public-itinerary-shell public-template-${template.id} isolate flex h-dvh min-w-0 flex-col overflow-hidden bg-background`}
      data-public-template={template.id}
      data-public-template-key={template.key}
      data-public-template-version={template.version}
    >
      <style data-public-template-styles={template.key}>{template.scopedCss}</style>
      <PublicItemDetailsPanel />
      {template.layout.children.map((node, index) => (
        <TemplateNode key={`${node.type}:${node.name}:${index}`} node={node} />
      ))}
    </main>
  );
}
