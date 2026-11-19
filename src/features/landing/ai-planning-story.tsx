import { ArrowDownRight, ArrowUpRight, CalendarDays, MessageCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";

import { LandingRevealSection } from "./landing-reveal-section";

import "./landing-ai-planning.css";

const examples = {
  global: {
    image: "/landing/seine-route.webp",
    title: "Two days in Paris",
    prompt: "Plan two days in Paris with art, cafés and walks by the water.",
    days: ["Louvre Museum · Seine riverside walk", "Canal Saint-Martin · Café stop"],
  },
  cn: {
    image: "/landing/western-sichuan-road.webp",
    title: "Two days in western Sichuan",
    prompt: "Plan two days in western Sichuan, with a scenic drive and time for photos.",
    days: ["Kangding Old Town · Zheduo Mountain", "Xinduqiao · Tagong Grassland"],
  },
} satisfies Record<AppRegion, { image: string; title: string; prompt: string; days: string[] }>;

export function AiPlanningStory({ appRegion }: { appRegion: AppRegion }) {
  const example = examples[appRegion];
  return (
    <LandingRevealSection
      aria-labelledby="plan-with-ai-title"
      className="landing-ai-story"
      id="plan-with-ai"
    >
      <div className="landing-ai-copy">
        <p className="landing-eyebrow">
          <Sparkles aria-hidden="true" /> <T message="AI PLANNING WITH MCP" />
        </p>
        <h2 id="plan-with-ai-title">
          <T message="Let your AI" />{" "}
          <span>
            <T message="plan the trip." />
          </span>
        </h2>
        <p className="landing-ai-description">
          <T message="Connect the AI you already use through MCP. Ask it to draft an itinerary and save it to There we go, where you can make it your own on the map and timeline." />
        </p>
        <Button asChild className="landing-ai-link" size="lg">
          <Link href="/account/ai" prefetch={false}>
            <T message="Connect your AI" /> <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="landing-ai-board">
        <Image
          alt=""
          className="landing-ai-photo"
          fill
          sizes="(max-width: 820px) 92vw, (max-width: 1920px) 52vw, 950px"
          src={example.image}
        />
        <div className="landing-ai-prompt">
          <p className="landing-ai-card-label">
            <MessageCircle aria-hidden="true" /> <T message="Example prompt" />
          </p>
          <p className="landing-ai-prompt-text">
            <T message={example.prompt} />
          </p>
        </div>
        <div aria-hidden="true" className="landing-ai-transfer">
          <ArrowDownRight />
        </div>
        <article className="landing-ai-ticket">
          <header>
            <div>
              <p className="landing-ai-card-label">
                <T message="Itinerary preview" />
              </p>
              <h3>
                <T message={example.title} />
              </h3>
            </div>
            <CalendarDays aria-hidden="true" />
          </header>
          <ol className="landing-ai-days">
            {example.days.map((day, index) => (
              <li key={day}>
                <span>
                  <T message="Day {number}" values={{ number: index + 1 }} />
                </span>
                <T message={day} />
              </li>
            ))}
          </ol>
        </article>
      </div>
    </LandingRevealSection>
  );
}
