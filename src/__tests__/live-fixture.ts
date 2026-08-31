import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FixtureHttpMessage {
  method?: string;
  url?: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FixtureInteraction {
  request: FixtureHttpMessage;
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

export interface LiveProtocolFixture {
  formatVersion: 1;
  source: "sample" | "recorded";
  region: "global" | "cn";
  recordedAt: string | null;
  interactions: {
    patExchange: FixtureInteraction;
    userinfo: FixtureInteraction;
    modelList: FixtureInteraction;
    chat: FixtureInteraction;
  };
}

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__", "live");

export function loadLiveFixture(region: "global" | "cn" = "global"): LiveProtocolFixture {
  return JSON.parse(readFileSync(join(fixtureDir, `sample-${region}.json`), "utf8")) as LiveProtocolFixture;
}

export function responseFromFixture(interaction: FixtureInteraction): Response {
  const body =
    typeof interaction.response.body === "string"
      ? interaction.response.body
      : JSON.stringify(interaction.response.body);
  return new Response(body, {
    status: interaction.response.status,
    headers: interaction.response.headers,
  });
}
