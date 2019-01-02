const q = require('daskeyboard-applet');
const request = require('request-promise');
const logger = q.logger;

const apiBaseUrl = 'https://api.travis-ci.com';

const ColorForBuildState = {
  "booting": "#FFA500", // orange
  "created": "#FFA500",
  "started": "#FFA500",
  "canceled": "#0000FF",
  "passed": "#00FF00", // green
  "failed": "#FF0000" // red
}

const EffectForBuildState = {
  "booting": q.Effects.SET_COLOR,
  "created": q.Effects.SET_COLOR,
  "started": q.Effects.SET_COLOR,
  "passed": q.Effects.SET_COLOR,
  "canceled": q.Effects.SET_COLOR,
  "failed": q.Effects.BLINK
}

const MessageForBuildState = {
  "booting": `build booting`,
  "created": `build created`,
  "started": `build running`,
  "canceled": `build canceled`,
  "passed": `build passing`,
  "failed": `build failing`
}

async function processReposResponse(response) {
  logger.info(`Processing travis repos response`);
  const options = [];
  response.repositories.forEach(repo => {
    options.push({
      key: repo.id.toString(),
      value: repo.name.toString()
    });
  });
  logger.info(`got ${options.length} options`);
  options.forEach(o => logger.info(`${o.key}: ${o.value}`));
  return options;


}

class TravisBuildInfo extends q.DesktopApp {
  constructor() {
    super();
    // run every min
    this.pollingInterval = 60000; // every minute
  }

  /**
   * Called after a user sets a new config in the Das Keyboard Q software
   */
  async applyConfig() {
    this.serviceHeaders = {
      'Travis-API-Version': '3',
      'Authorization': `token ${this.authorization.apiKey}`
    }
    this.getRepoSlug().then(slug => this.repoSlug = slug);
  }

  async getRepoSlug() {
    logger.info(`Getting selected repos slug`);
    const options = {
      uri: apiBaseUrl + `/repo/${this.config.repoId}`,
      headers: this.serviceHeaders,
      json: true
    }
    return request.get(options).then(body => {
      return body.slug;
    }).catch(err => {
      logger.info(`Error while fetching slug for repoId ${this.config.repoId}`);
      return '';
    });
  }

  /**
   * Loads the list of repose from the Travis API
   */
  async  loadRepos() {
    logger.info(`Loading repos`);
    const options = {
      uri: apiBaseUrl + `/repos?limit=1000`,
      headers: this.serviceHeaders,
      json: true
    }

    return request.get(options);
  }

  /**
   * Called from the Das Keyboard Q software to retrieve the options to display for
   * the user inputs
   * @param {} fieldId 
   * @param {*} search 
   */
  async options(fieldId, search) {
    return this.loadRepos().then(body => {
      return processReposResponse(body);
    }).catch(error => {
      logger.error(`Caught error when loading options: ${error}`);
    });
  }

  /**
   * Request to fetch the builds for a repoId given in params
   * @param {*} repoId 
   */
  async getBuilds(repoId) {
    const options = {
      uri: apiBaseUrl + `/repo/${repoId}/builds?limit=5`,
      headers: this.serviceHeaders,
      json: true
    }
    return request.get(options);
  }

  /**
   * Runs every N second. Will fetch the latest build of the chosen repoId and
   * send a signal to the Das Keyboard Q Software depending on the build state
   */
  async run() {
    logger.info(`Running.`);
    const repoId = this.config.repoId;
    if (repoId) {
      logger.info(`My repoId is: ${repoId}`);
      return this.getBuilds(repoId).then(body => {
        const latestBuild = body.builds[0];
        let signalColor;
        let signalEffect;
        let signalMessage;
        if (latestBuild) {
          const latestBuildState = latestBuild.state;
          /* set the signal color depending on the build state. 
          White if state not recognized */
          logger.info(`Latest build state ${latestBuildState}`);
          if (Object.keys(ColorForBuildState).includes(latestBuildState)) {
            signalColor = ColorForBuildState[latestBuildState];
          } else {
            signalColor = '#FFFFFF';
          }
          /**
           * set the signal effect depending on the build state.
           * SET_COLOR if state not recognized
           */
          if (Object.keys(EffectForBuildState).includes(latestBuildState)) {
            signalEffect = EffectForBuildState[latestBuildState];
          } else {
            signalEffect = q.Effects.SET_COLOR;
          }
          /**
           * set the signal message depending on the build state.
           */
          if (Object.keys(MessageForBuildState).includes(latestBuildState)) {
            signalMessage = MessageForBuildState[latestBuildState];
          } else {
            signalMessage = `Build state not recognized`;
          }
          // get the repository name from the input config
          const repoName = this.config.repoId_LABEL || this.config.repoId;
          // Send the signal
          let signal = new q.Signal({
            points: [[new q.Point(signalColor, signalEffect)]],
            name: `Travis`,
            message: `${repoName}: ` + signalMessage,
            link: {
              url: `https://travis-ci.com/${this.repoSlug}`,
              label: `Show in Travis`
            }
          });

          return signal;
        } else {
          return null;
        }
      }).catch(error => {
        logger.error(`Error while getting builds for repoId ${repoId}: ${error}`);
        return q.Signal.error([`Error while getting builds for repoId ${repoId}`]);
      })
    } else {
      logger.info(`No repoId configured.`);
      return q.Signal.error([`No repository configured, please check your applet input configuration`]);
    }

  }
}


module.exports = {
  TravisBuildInfo: TravisBuildInfo,
  processReposResponse: processReposResponse
}

const applet = new TravisBuildInfo();