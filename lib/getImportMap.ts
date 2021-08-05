import got from "got";

export interface IImportMapFile {
  imports: Record<string, string>;
}

const validateResponse = (url: string, body: string): void => {
  if (body.includes(`<body`)) {
    throw new Error(
      `Failed to download file at ${url}. Downloaded contents include HTML from the root app, indicating that the file does not exist.`
    );
  }
};

const downloadJsonObject = async <T>(config: {
  urlToDownload: string;
}): Promise<T> => {
  const { urlToDownload } = config;
  console.debug(`Downloading ${urlToDownload}...`);
  const responsePromise = got.get(urlToDownload);
  validateResponse(urlToDownload, await responsePromise.text());
  return responsePromise.json<T>();
};

export type PossibleEnvironment =
  | "development"
  | "qa"
  | "staging"
  | "production";

export const CommonUIBaseUrlByEnv: Record<PossibleEnvironment, string> = {
  development: "https://dev-app.vtxdev.net",
  qa: "https://qa-app.vtxdev.net",
  staging: "https://stage-app.vertexcloud.com",
  production: "https://app.vertexcloud.com",
};

export const allEnvironmentNames = Object.keys(
  CommonUIBaseUrlByEnv
) as PossibleEnvironment[];

export const getAppUrl = (environment: PossibleEnvironment) =>
  `${CommonUIBaseUrlByEnv[environment]}/ui`;

export const getImportMapJSON = async (config: {
  environment: PossibleEnvironment;
}): Promise<{
  environment: PossibleEnvironment;
  importMapInEnvironment: IImportMapFile;
}> => {
  const { environment } = config;
  const appUrl = getAppUrl(environment);
  const importMapFileUrl = `${appUrl}/import-map.json`;
  console.debug(`Getting import map file at ${importMapFileUrl}...`);
  const importMapInEnvironment = await downloadJsonObject<IImportMapFile>({
    urlToDownload: importMapFileUrl,
  });
  return {
    environment,
    importMapInEnvironment,
  };
};
