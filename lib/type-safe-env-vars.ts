import { z } from "zod";

const EnvVarsSchema = z.object({
  WIMFME_GITHUB_PAT: z.string(),
  WIMFME_GITHUB_ORG: z.string(),
  WIMFME_GITHUB_FILTER_PREFIX: z.string(),
});

type EnvVars = z.infer<typeof EnvVarsSchema>;

/* private */ const unTypeSafeValues: EnvVars = {
  WIMFME_GITHUB_ORG:
    process.env.WIMFME_GITHUB_ORG ||
    (() => {
      throw new Error(`missing process.env.WIMFME_GITHUB_ORG`);
    })(),
  WIMFME_GITHUB_PAT:
    process.env.WIMFME_GITHUB_PAT ||
    (() => {
      throw new Error(`missing process.env.WIMFME_GITHUB_PAT`);
    })(),
  WIMFME_GITHUB_FILTER_PREFIX:
    process.env.WIMFME_GITHUB_FILTER_PREFIX ||
    (() => {
      throw new Error(`missing process.env.WIMFME_GITHUB_FILTER_PREFIX`);
    })(),
};

export const getEnvVars = (): EnvVars => {
  return unTypeSafeValues;
};

export const redactSecrets = (input: string | Error): string => {
  const envVars = getEnvVars();
  let result = input instanceof Error ? input.message : input;
  Object.keys(envVars).forEach((anEnvKey) => {
    const anEnvValue = (envVars as Record<string, string>)[anEnvKey];

    result = result.replace(
      new RegExp(anEnvValue, "g"),
      `REDACTED:${anEnvKey}`
    );
  });

  return result;
};
