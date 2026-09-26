/**
 * Codecov recipe v2: how a fleet repository sends coverage and test results
 * to Codecov. The test job writes both on one leg and saves them as
 * artifacts; a job of its own, holding the only OIDC token, downloads them
 * and uploads them, running none of the repository's code. The pins below
 * are the ones testing-os, attestia, comfy-headless and websketch-ir run.
 */

export const UPLOAD = 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
export const UPLOAD_TAG = 'v7.0.1';
export const DOWNLOAD = 'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c';
export const DOWNLOAD_TAG = 'v8.0.1';
export const CODECOV = 'codecov/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5';
export const CODECOV_TAG = 'v7.1.1';
// The Codecov CLI the action runs, fixed rather than whichever is newest.
export const CLI_VERSION = 'v11.3.1';
// The checkout the codecov job uses when the test job has none to copy.
export const CHECKOUT = 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0';
export const CHECKOUT_TAG = 'v6.0.3';
// The c8 that turns raw V8 coverage into lcov, at an exact version so npx
// fetches the same one every run.
export const C8 = 'c8@12.0.0';

export const COVERAGE_ARTIFACT = 'codecov-coverage';
export const RESULTS_ARTIFACT = 'codecov-test-results';
export const BRANCH = 'ci/codecov';
export const TITLE = 'ci: upload coverage and test results to Codecov with OIDC';

// The events whose runs send reports: a pull request, and a push to the
// default branch. A push to any other branch runs its tests without them.
export const EVENTS = "github.event_name == 'pull_request' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch)";

export const CODECOV_YML = `# Coverage is reported here, never enforced. Both statuses are informational,
# so no coverage number can block a merge, and neither names a fixed target.
# The signal read on a pull request is patch coverage: how much of the lines
# it changed the tests actually ran. The comment carries that and the test
# results; the repository-wide percentage stays out of it.
coverage:
  status:
    project:
      default:
        informational: true
    patch:
      default:
        informational: true

comment:
  layout: "condensed_header, condensed_files, condensed_footer"
  hide_project_coverage: true
  require_changes: false
`;

// Where else Codecov looks for its settings. Recipe v2 keeps one file,
// codecov.yml at the root.
export const OTHER_CONFIGS = ['.codecov.yml', 'codecov.yaml', '.codecov.yaml', '.github/codecov.yml', '.github/.codecov.yml', '.github/codecov.yaml', 'dev/codecov.yml'];
