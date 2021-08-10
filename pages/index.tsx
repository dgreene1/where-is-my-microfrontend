import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";
import { InferGetServerSidePropsType } from "next";
import { Octokit } from "octokit";
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import dayjs from "dayjs";
import {
  allEnvironmentNames,
  CommonUIBaseUrlByEnv,
  getImportMapJSON,
  IImportMapFile,
  PossibleEnvironment,
} from "../lib/getImportMap";
import { ResourceUrlParsed, urlToParsed } from "../lib/urlToCommit";
import {
  Row,
  Col,
  Divider,
  Card,
  Alert,
  Space,
  Tag,
  Switch,
  Tooltip,
} from "antd";
import { ClockCircleOutlined, LinkOutlined } from "@ant-design/icons";
import { useState } from "react";

interface CommitDetails extends ResourceUrlParsed {
  commitedDateStr: string | null;
  devEnvCommittedDateStr: string | null;
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
  }>,
  reposToIgnore: string[]
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
      if (
        importName.includes("vtx-ui") &&
        !reposToIgnore.includes(importName)
      ) {
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
    devEnvCommittedDateStr: newValue,
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
      devEnvCommittedDateStr:
        /* we can't know this yet because not all of them have been iterated over yet */ null,
      commitInfo,
    };

    result[importName][environment] = commitDetails;
  });

  for (const [importName, commitByEnv] of Object.entries(result)) {
    result[importName] = urlInfoToDetailsInitializer(commitByEnv, null);
    for (const [environmentUnsafe, commitInfo] of Object.entries(commitByEnv)) {
      const environment = environmentUnsafe as PossibleEnvironment;

      const existingRecord = result[importName][environment];
      const itemInDev = result[importName]["development"];

      if (existingRecord) {
        existingRecord.devEnvCommittedDateStr = itemInDev
          ? itemInDev.commitedDateStr
          : null;
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

  // TODO: just delete these repos
  const reposToIgnore = [
    "vtx-ui-mf-test",
    "vtx-ui-mf-smb-user-management",
    "vtx-ui-mf-calc-config-settings",
  ];

  const urlsByEnvironmentByRepo = await decorateWithCommitInfo(
    groupByRepoNameByEnvironment(importMaps, reposToIgnore),
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
        message={`NOTE: if you do not see the expected repositories, please remember to set the repo visibility to "internal" (or "public" if legal agrees), but make sure it is not set to "private"`}
        type="warning"
        showIcon={true}
      />
    </Space>
  );
};

type DateAlertType = "time since dev" | "time since now";

const StalenessWarning = (props: {
  info: CommitDetails | null;
  timeDeltaType: DateAlertType;
  importName: string;
  urlsByEnvironmentByRepo: DetailedCommitByEnvByRepoName;
}) => {
  const { info, timeDeltaType, urlsByEnvironmentByRepo, importName } = props;
  const daysInTypicalSprint = 14;

  if (!info || info.commitedDateStr === null) {
    return null;
  }
  const danger = "#f5222d";
  const almostDanger = "#ff802b";
  const warning = "#cea32e";
  const healthy = "#289763";
  const acceptable = "#2b1daa";

  const daysSincePromoted =
    timeDeltaType === "time since now"
      ? Math.abs(dayjs(info.commitedDateStr).diff(new Date(), "days"))
      : info.devEnvCommittedDateStr
      ? Math.abs(
          dayjs(info.commitedDateStr).diff(info.devEnvCommittedDateStr, "days")
        )
      : null;

  let dateMessage =
    timeDeltaType === "time since dev"
      ? `${daysSincePromoted} days behind dev env`
      : `deployed ${daysSincePromoted} days ago`;

  if (daysSincePromoted === null) {
    return null;
  }
  let color = healthy;

  if (daysSincePromoted > 1 * daysInTypicalSprint) {
    color = warning;
  }
  if (daysSincePromoted > 2 * daysInTypicalSprint) {
    color = almostDanger;
  }
  if (daysSincePromoted > 4 * daysInTypicalSprint) {
    color = danger;
  }
  const itemInDev = urlsByEnvironmentByRepo[importName]["development"];
  const itemInProduction = urlsByEnvironmentByRepo[importName]["production"];
  if (
    timeDeltaType === "time since dev" &&
    !!itemInDev &&
    !!itemInProduction &&
    itemInDev.commitedDateStr === itemInProduction.commitedDateStr
  ) {
    color = acceptable;
    dateMessage = "up to date with dev env";
  }

  return (
    <div>
      <Tag color={color}>{dateMessage}</Tag>
      <ClockCircleOutlined style={{ color }} />
    </div>
  );
};

function Page({
  urlsByEnvironmentByRepo,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const importNameToEnvironmentTuples = Object.entries(urlsByEnvironmentByRepo);
  const noItemsFoundMessage = `The token you provided might not have the necessary scopes and/or have read access since we were unable to get any information for any repository`;

  const [timeDeltaType, setTimeDeltaType] =
    useState<DateAlertType>("time since dev");

  const determineInverse = (type: DateAlertType): DateAlertType => {
    if (type === "time since dev") {
      return "time since now";
    } else {
      return "time since dev";
    }
  };

  const toggleTimeDeltaType = () => {
    setTimeDeltaType(determineInverse(timeDeltaType));
  };

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
        <Divider orientation="left"></Divider>
        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 32 }}>
          Currently showing &quot;{timeDeltaType}&quot; (click switch to show
          &quot;{determineInverse(timeDeltaType)}&quot;)
          <Switch onChange={toggleTimeDeltaType} style={{ marginLeft: 5 }} />
        </Row>
        {importNameToEnvironmentTuples.length === 0
          ? noItemsFoundMessage
          : importNameToEnvironmentTuples.map(([importName, urlsByEnv]) => {
              return (
                <div key={importName}>
                  <Divider orientation="left"></Divider>
                  <h2>
                    {importName}{" "}
                    <a
                      href={`https://github.com/vertexinc/${importName}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <LinkOutlined />
                    </a>
                  </h2>
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
                            <Card
                              style={{ minWidth: 340 }}
                              title={
                                <>
                                  <span>{environmentName}</span>
                                  <StalenessWarning
                                    info={info}
                                    importName={importName}
                                    urlsByEnvironmentByRepo={
                                      urlsByEnvironmentByRepo
                                    }
                                    timeDeltaType={timeDeltaType}
                                  />
                                </>
                              }
                              bordered={true}
                            >
                              <div>commit SHA:</div>
                              <a href={info?.commitInfo?.data.html_url}>
                                {info?.commitSha}
                              </a>
                              <div style={{ height: "5px" }}></div>
                              <div>commited on:</div>
                              <div>
                                {info?.commitedDateStr
                                  ? dayjs(info?.commitedDateStr).format(
                                      "MM/DD/YYYY"
                                    )
                                  : ""}
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
