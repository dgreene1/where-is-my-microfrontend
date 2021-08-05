import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { InferGetServerSidePropsType } from "next";
import { Octokit } from "octokit";
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import got from "got";
import {
  allEnvironmentNames,
  CommonUIBaseUrlByEnv,
  getImportMapJSON,
  IImportMapFile,
  PossibleEnvironment,
} from "../lib/getImportMap";
import { ResourceUrlParsed, urlToParsed } from "../lib/urlToCommit";
import { Row, Col, Divider, Card, Alert, Space } from "antd";

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
  commitInfo: RestEndpointMethodTypes["repos"]["getCommit"]["response"] | null;
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
  urlInfo: ResourceUrlParsed | null,
  newValue: null
): CommitDetails | null => {
  if (urlInfo === null) {
    return null;
  }

  return {
    commitedDateStr: newValue,
    commitInfo: null,
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
    development: setCommitDateToNull(input["development"], initialialValue),
    qa: setCommitDateToNull(input["qa"], initialialValue),
    staging: setCommitDateToNull(input["staging"], initialialValue),
    production: setCommitDateToNull(input["production"], initialialValue),
  };
};

interface AwaitableCommitInfo {
  importName: string;
  environment: PossibleEnvironment;
  getCommitPromise: Promise<
    RestEndpointMethodTypes["repos"]["getCommit"]["response"]
  >;
}

const asyncGetCommitsWithContext = async (
  input: AwaitableCommitInfo
): Promise<{
  importName: string;
  environment: PossibleEnvironment;
  commitInfo: RestEndpointMethodTypes["repos"]["getCommit"]["response"];
}> => {
  const { environment, importName } = input;
  const commitInfo = await input.getCommitPromise;

  return {
    commitInfo,
    environment,
    importName,
  };
};

const decorateWithCommitInfo = async (
  lookup: CommitByEnvByRepoName,
  octokitInstance: Octokit
): Promise<DetailedCommitByEnvByRepoName> => {
  const result: DetailedCommitByEnvByRepoName = {};
  const promisesByHash: AwaitableCommitInfo[] = [];
  for (const [importName, commitByEnv] of Object.entries(lookup)) {
    result[importName] = urlInfoToDetailsInitializer(commitByEnv, null);
    for (const [environmentUnsafe, commitInfo] of Object.entries(commitByEnv)) {
      const environment = environmentUnsafe as PossibleEnvironment;
      if (commitInfo) {
        const getCommitPromise = octokitInstance.rest.repos.getCommit({
          owner: process.env.WIMFME_GITHUB_ORG as string,
          repo: importName,
          ref: commitInfo.commitSha,
        });

        promisesByHash.push({
          environment,
          importName,
          getCommitPromise,
        });
      }
    }
  }

  const fullDataPerCommit = await Promise.all(
    promisesByHash.map(asyncGetCommitsWithContext)
  );

  fullDataPerCommit.forEach(({ importName, environment, commitInfo }) => {
    const maybeTheDate = commitInfo.data.commit.committer?.date;
    const commitedDateStr = !maybeTheDate ? null : maybeTheDate;
    console.log(`commitedDateStr: ${commitedDateStr}`);
    const commitDetails: CommitDetails = {
      fullUrl: result[importName][environment]!.fullUrl,
      commitSha: commitInfo.data.sha,
      commitedDateStr,
      commitInfo,
    };

    result[importName][environment] = commitDetails;
  });

  return result;
};

export const getServerSideProps = async () => {
  const octokitInstance = new Octokit({
    auth: process.env.WIMFME_GITHUB_PAT,
    log: console,
  });

  // check each import map for the commit from each repo
  // display each commit for each repo for each environment
  // Check how old that commit is
  // Check if a commit is waiting to be promoted (i.e. it's newer than the higher environment's commit)

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
      urlsByEnvironmentByRepo,
    },
  };
};

const AboutSection = () => {
  return (
    <Space direction="vertical" style={{ maxWidth: "600px" }}>
      <div>
        This page is designed to help you track down the state of each
        MicroFrontend in each environment.
      </div>

      <Alert
        message={`NOTE: if you do not see the expected repositories, please remember to set the repo visibility to "internal" or "public" (if legal agrees), but make sure it is not set to "private"`}
        type="warning"
        showIcon={true}
      />
    </Space>
  );
};

function Page({
  urlsByEnvironmentByRepo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const importNameToEnvironmentTuples = Object.entries(urlsByEnvironmentByRepo);
  const noItemsFoundMessage = `The token you provided might not have the necessary scopes and/or have read access since we were unable to get any information for any repository`;

  return (
    <div className={styles.container}>
      <Head>
        <title>Where Is My MicroFrontend</title>
        <meta
          name="description"
          content="An app that helps you determine what needs to be promoted"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1>Where Is My MicroFrontend</h1>
        <AboutSection />
        {importNameToEnvironmentTuples.length === 0
          ? noItemsFoundMessage
          : importNameToEnvironmentTuples.map(([importName, urlsByEnv]) => {
              return (
                <div key={importName}>
                  <Divider orientation="left"></Divider>
                  <h2>{importName}</h2>
                  <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
                    {Object.entries(urlsByEnv).map(
                      ([environmentName, info]) => {
                        const style = {
                          background: "#0092ff",
                          padding: "8px 0",
                        };

                        return (
                          <Col
                            className="gutter-row"
                            key={environmentName}
                            span={6}
                          >
                            <Card title={environmentName} bordered={true}>
                              <div>commit: {info?.commitSha}</div>
                              <div>
                                commitedDateStr:{" "}
                                {info?.commitedDateStr?.toString()}
                              </div>
                            </Card>
                          </Col>
                        );
                      }
                    )}
                  </Row>
                </div>
              );
            })}
      </main>
    </div>
  );
}

export default Page;
