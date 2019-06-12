/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as functions from "firebase-functions";

import * as log from "./log";
import * as encoding from "./shared/encoding";
import * as types from "./types";

interface Repo {
  org: string;
  name: string;
}

export function getFunctionsConfig(key: string): any {
  // Allow the environment to overrride anything else
  const envKey = encoding.toEnvKey(key);
  const envOverride = process.env[envKey];
  if (envOverride) {
    log.debug(`Config override: ${key}=${envKey}=${envOverride}`);
    return envOverride;
  }

  const encodedKey = encoding.encodeKey(key);
  const parts = encodedKey.split(".");

  let val = functions.config();
  for (const part of parts) {
    if (val === undefined) {
      return undefined;
    }

    val = val[part];
  }

  return encoding.deepDecodeObject(val);
}

/**
 * Create a new config handler.
 * @param {object} config JSON config data.
 */
export class BotConfig {
  config: types.Config;

  static getDefault() {
    return new BotConfig(getFunctionsConfig("runtime.config"));
  }

  constructor(config: types.Config) {
    this.config = config;
  }

  /**
   * Get a list of all configured repos.
   */
  getAllRepos() {
    const repos: Repo[] = [];

    for (const org in this.config) {
      for (const name in this.config[org]) {
        repos.push({
          org: org,
          name: name
        });
      }
    }

    return repos;
  }

  /**
   * Determine the features that are enabled for a repo.
   */
  getRepoFeatures(org: string, name: string): types.FeatureConfig {
    const features: types.FeatureConfig = {
      custom_emails: false,
      issue_labels: false,
      issue_cleanup: false,
      repo_reports: false
    };

    const config = this.getRepoConfig(org, name);
    if (!config) {
      return features;
    }

    // Emails are enabled if any label has an 'email' entry.
    // Labels are enabled if any label has a 'regex' entry.
    if (config.labels) {
      const labels = config.labels;
      for (const label in labels) {
        const labelConfig = config.labels[label];
        if (labelConfig.email) {
          features.custom_emails = true;
        }

        if (labelConfig.regex) {
          features.issue_labels = true;
        }
      }
    }

    // Issue cleanup is enabled if there is a configuration for it.
    if (config.cleanup && config.cleanup.issue) {
      features.issue_cleanup = true;
    }

    // Repo reports are enabled if an email is specified.
    if (config.reports && config.reports.email) {
      features.repo_reports = true;
    }

    return features;
  }

  /**
   * Get the config object for a specific repo.
   */
  getRepoConfig(org: string, name: string): types.RepoConfig | undefined {
    const cleanOrg = encoding.sanitizeKey(org);
    const cleanName = encoding.sanitizeKey(name);
    if (this.config[cleanOrg] && this.config[cleanOrg][cleanName]) {
      return this.config[cleanOrg][cleanName];
    }
  }

  /**
   * Get the config object for a single label of a specific repo.
   */
  getRepoLabelConfig(
    org: string,
    name: string,
    label: string
  ): types.LabelConfig | undefined {
    const repoConfig = this.getRepoConfig(org, name);

    const cleanLabel = encoding.sanitizeKey(label);
    if (repoConfig && repoConfig.labels && repoConfig.labels[cleanLabel]) {
      return repoConfig.labels[cleanLabel];
    }
  }

  /**
   * Get the templates configuration for a specific repo.
   */
  getRepoTemplateConfig(
    org: string,
    name: string,
    template: string
  ): string | undefined {
    const repoConfig = this.getRepoConfig(org, name);

    const cleanTemplate = encoding.sanitizeKey(template);
    if (
      repoConfig &&
      repoConfig.templates &&
      repoConfig.templates[cleanTemplate]
    ) {
      return repoConfig.templates[cleanTemplate];
    }
  }

  /**
   * Get the config for weekly repo report emails.
   */
  getRepoReportingConfig(
    org: string,
    name: string
  ): types.ReportConfig | undefined {
    const repoConfig = this.getRepoConfig(org, name);

    if (repoConfig && repoConfig.reports) {
      return repoConfig.reports;
    }
  }

  /**
   * Get the config for cleaning up stale issues on a repo.
   */
  getRepoCleanupConfig(
    org: string,
    name: string
  ): types.CleanupConfig | undefined {
    const repoConfig = this.getRepoConfig(org, name);
    if (repoConfig && repoConfig.cleanup) {
      return repoConfig.cleanup;
    }
  }

  /**
   * Get the config for validating issues on a repo.
   */
  getRepoTemplateValidationConfig(
    org: string,
    name: string,
    templatePath: string
  ): types.TemplateValidationConfig | undefined {
    const repoConfig = this.getRepoConfig(org, name);
    if (repoConfig && repoConfig.validation) {
      return repoConfig.validation.templates[templatePath];
    }
  }

  /**
   * Get the default template path for a type.
   */
  static getDefaultTemplateConfig(template: string) {
    if (template === "issue") {
      return "ISSUE_TEMPLATE.md";
    } else {
      return "PULL_REQUEST_TEMPLATE.md";
    }
  }
}
