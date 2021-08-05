import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { InferGetServerSidePropsType } from "next";
import { Octokit } from "octokit";
import got from "got";
import {
  allEnvironmentNames,
  CommonUIBaseUrlByEnv,
  getImportMapJSON,
  IImportMapFile,
  PossibleEnvironment,
} from "../lib/getImportMap";
import { ResourceUrlParsed, urlToParsed } from "../lib/urlToCommit";

// const getAllReposWeCareAbout = (
//   importMaps: Array<{
//     environment: PossibleEnvironment;
//     importMapInEnvironment: IImportMapFile;
//   }>
// ) => {
//   const devImportMap = importMaps.find(
//     (aMap) => aMap.environment === "development"
//   );

//   if (!devImportMap) {
//     throw new Error(
//       "We should have been able to find an import map for the dev environment but something went wrong."
//     );
//   }

//   return Object.keys(devImportMap.importMapInEnvironment.imports).filter(
//     (name) => name.includes("vtx-ui")
//   );
// };

interface CommitDetails extends ResourceUrlParsed {
  commitedDateStr: string | null;
}

type CommitByEnvByRepoName = Record<
  string,
  Record<PossibleEnvironment, ResourceUrlParsed | null>
>;
type DetailedCommitByEnvByRepoName = Record<
  string,
  Record<PossibleEnvironment, CommitDetails | null>
>;

const groupByRepoNameByEnvironment = (
  importMaps: Array<{
    environment: PossibleEnvironment;
    importMapInEnvironment: IImportMapFile;
  }>
): CommitByEnvByRepoName => {
  const lookup: Record<
    string,
    Record<PossibleEnvironment, ResourceUrlParsed | null>
  > = {};
  importMaps.forEach((deploymentTarget) => {
    const environment = deploymentTarget.environment;
    const imports = Object.entries(
      deploymentTarget.importMapInEnvironment.imports
    );

    imports.forEach(([importName, importUrl]) => {
      if (importName.includes("vtx-ui")) {
        const possiblyExistingItem = lookup[importName];
        // Initialize the inner lookup if it hasn't already been
        if (!possiblyExistingItem) {
          lookup[importName] = {
            development: null,
            qa: null,
            staging: null,
            production: null,
          };
        }

        lookup[importName][environment] = urlToParsed({
          importUrl,
          importName,
        });
      }
    });
  });

  return lookup;
};

const setCommitDateToNull = (
  urlInfo: ResourceUrlParsed | null
): CommitDetails | null => {
  if (urlInfo === null) {
    return null;
  }

  return {
    commitedDateStr: null,
    ...urlInfo,
  };
};

/**
 * The point of this is to initialize to null so that Next.JS can serialize the object (Next doesn't like serializing undefined values since it's not part of the JSON spec)
 */
const urlInfoToDetailsInitializer = (
  input: Record<PossibleEnvironment, ResourceUrlParsed | null>,
  initialialValue: null
): Record<PossibleEnvironment, CommitDetails | null> => {
  return {
    development: setCommitDateToNull(input["development"]),
    qa: setCommitDateToNull(input["qa"]),
    staging: setCommitDateToNull(input["staging"]),
    production: setCommitDateToNull(input["production"]),
  };
};

const decorateWithCommitInfo = async (
  lookup: CommitByEnvByRepoName,
  octokitInstance: Octokit
): Promise<DetailedCommitByEnvByRepoName> => {
  const result: DetailedCommitByEnvByRepoName = {};
  for (const [importName, commitByEnv] of Object.entries(lookup)) {
    result[importName] = urlInfoToDetailsInitializer(commitByEnv, null);
    for (const [environmentUnsafe, commitInfo] of Object.entries(commitByEnv)) {
      const environment = environmentUnsafe as PossibleEnvironment;
      if (commitInfo) {
        const fullCommitInfoFromAPI = commitInfo.commitSha
          ? await octokitInstance.rest.repos.getCommit({
              owner: process.env.WIMFME_GITHUB_ORG as string,
              repo: importName,
              ref: commitInfo.commitSha,
            })
          : undefined;
        console.log(fullCommitInfoFromAPI);
        const maybeTheDate = fullCommitInfoFromAPI?.data.commit.committer?.date;
        const commitedDateStr = !maybeTheDate ? null : maybeTheDate;
        console.log(`commitedDateStr: ${commitedDateStr}`);
        const commitDetails: CommitDetails = {
          commitSha: commitInfo.commitSha,
          fullUrl: commitInfo.fullUrl,
          commitedDateStr,
        };

        result[importName][environment] = commitDetails;
      } else {
        result[importName] = {
          development: null,
          qa: null,
          staging: null,
          production: null,
        };
      }
    }
  }
  return result;
};

export const getServerSideProps = async () => {
  const octokitInstance = new Octokit({
    auth: process.env.WIMFME_GITHUB_PAT,
    log: console,
  });

  // get repos
  // check each import map for the commit from each of those repos
  // display each commit for each repo for each environment
  // Check how old that commit is
  // Check if a commit is waiting to be promoted (i.e. it's newer than the higher environment's commit)

  const listForOrgParams = {
    org: process.env.WIMFME_GITHUB_ORG as string,
    type: "internal",
  } as const;

  console.log(
    `About to call octokitInstance.rest.repos.listForOrg with ${JSON.stringify(
      listForOrgParams
    )}`
  );

  const { data: repos } = await octokitInstance.rest.repos.listForOrg(
    listForOrgParams
  );

  const importMaps = await Promise.all(
    allEnvironmentNames.map((environment) => {
      return getImportMapJSON({
        environment,
      });
    })
  );

  const urlsByEnvironmentByRepo = await decorateWithCommitInfo(
    groupByRepoNameByEnvironment(importMaps),
    octokitInstance
  );

  return {
    props: {
      repos,
      urlsByEnvironmentByRepo,
    },
  };
};

function Page({
  repos,
  urlsByEnvironmentByRepo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const repoNames = repos
    .map((r) => {
      return r.name + " ";
    })
    .filter((r) => {
      return r.includes(process.env.WIMFME_GITHUB_FILTER_PREFIX as string);
    });

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="Generated by create next app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        {repoNames.length ? repoNames : "NONE FOUND"}

        {/* {importMapsPerEnvironment.map((anEnvironment) => (
          <div>
            <h2>{anEnvironment.environment}</h2>
            <div>{JSON.stringify(anEnvironment.importMapInEnvironment)}</div>
          </div>
        ))} */}

        {Object.entries(urlsByEnvironmentByRepo).map(
          ([importName, urlsByEnv]) => {
            return (
              <div key={importName}>
                <h2>{importName}</h2>
                <div>
                  {Object.entries(urlsByEnv).map(([environmentName, info]) => {
                    return (
                      <div key={environmentName}>
                        <div>environmentName: {environmentName}</div>
                        <div>url: {info?.fullUrl}</div>
                        <div>commit: {info?.commitSha}</div>
                        <div>
                          commitedDateStr: {info?.commitedDateStr?.toString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
        )}
      </main>
    </div>
  );
}

export default Page;
