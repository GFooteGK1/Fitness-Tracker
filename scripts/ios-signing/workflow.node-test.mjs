import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const workflow = await readFile(
  `${repositoryRoot}/.github/workflows/ios-testflight.yml`,
  'utf8'
)
const project = await readFile(`${repositoryRoot}/ios/project.yml`, 'utf8')
const hostEntitlements = await readFile(
  `${repositoryRoot}/ios/Supporting/App.entitlements`,
  'utf8'
)
const extensionEntitlements = await readFile(
  `${repositoryRoot}/ios/Supporting/BackgroundUpload.entitlements`,
  'utf8'
)
const hostPrivacyManifest = await readFile(
  `${repositoryRoot}/ios/Supporting/App/PrivacyInfo.xcprivacy`,
  'utf8'
)
const extensionPrivacyManifest = await readFile(
  `${repositoryRoot}/ios/Supporting/BackgroundUpload/PrivacyInfo.xcprivacy`,
  'utf8'
)
const appIconManifest = await readFile(
  `${repositoryRoot}/ios/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`,
  'utf8'
)
const appIcon = await readFile(
  `${repositoryRoot}/ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`
)

test('TestFlight workflow is manual, branch-bound, and read-only', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /^\s+pull_request:/m)
  assert.doesNotMatch(workflow, /^\s+pull_request_target:/m)
  assert.doesNotMatch(workflow, /^\s+push:/m)
  assert.match(workflow, /contents: read/)
  assert.match(workflow, /environment: TestFlight/)
  assert.match(workflow, /refs\/heads\/codex\/auto-meal-photos-probe/)
  assert.match(workflow, /UPLOAD TESTFLIGHT PROBE/)
  assert.match(workflow, /cancel-in-progress: false/)
})

test('secrets are scoped to signing, archive, and upload steps', () => {
  const jobHeader = workflow.slice(workflow.indexOf('jobs:'), workflow.indexOf('    steps:'))
  assert.doesNotMatch(jobHeader, /secrets\./)
  assert.doesNotMatch(jobHeader, /\$\{\{\s*runner\./)

  const requiredSecrets = [
    'APPLE_DISTRIBUTION_P12_BASE64',
    'APPLE_DISTRIBUTION_P12_PASSWORD',
    'HOST_PROVISIONING_PROFILE_BASE64',
    'EXTENSION_PROVISIONING_PROFILE_BASE64',
    'APP_STORE_CONNECT_API_KEY_P8_BASE64',
    'PROBE_UPLOAD_BASE_URL',
  ]
  for (const secret of requiredSecrets) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`))
  }

  assert.doesNotMatch(workflow, /APPLE_ID_PASSWORD/)
  assert.doesNotMatch(workflow, /verification.code/i)
  assert.doesNotMatch(workflow, /actions\/upload-artifact/)
})

test('workflow validates profiles, signs both targets, and uploads one IPA', () => {
  assert.match(workflow, /Apple Distribution/)
  assert.match(workflow, /application-identifier/)
  assert.match(workflow, /beta-reports-active/)
  assert.match(workflow, /ProvisionedDevices/)
  assert.match(workflow, /com\.sociusfit\.automeals/)
  assert.match(workflow, /com\.sociusfit\.automeals\.background-upload/)
  assert.match(workflow, /openssl x509 -noout -checkend 0/)
  assert.match(workflow, /HOST_PROVISIONING_PROFILE_SPECIFIER/)
  assert.match(workflow, /EXTENSION_PROVISIONING_PROFILE_SPECIFIER/)
  assert.match(workflow, /SociusFitAutoMeals\.app/)
  assert.match(workflow, /codesign --verify --deep --strict/)
  assert.match(workflow, /--validate-app/)
  assert.match(workflow, /--upload-app/)
  assert.match(workflow, /--apiKey/)
  assert.match(workflow, /--apiIssuer/)
})

test('probe endpoint remains fail-closed and cleanup is unconditional', () => {
  assert.match(workflow, /example\.invalid/)
  assert.match(workflow, /\/api\/meals\/upload/)
  assert.match(workflow, /BACKGROUND_UPLOAD_URL_BASE/)
  assert.match(workflow, /name: Remove signing material\r?\n\s+if: always\(\)/)
  assert.match(workflow, /Refusing to clean a path outside RUNNER_TEMP/)
  assert.doesNotMatch(workflow, /cloudflare/i)
  assert.doesNotMatch(workflow, /vercel/i)
})

test('XcodeGen project uses Release distribution signing per target', () => {
  const projectSettings = project.slice(
    project.indexOf('settings:'),
    project.indexOf('targets:')
  )
  const hostTarget = project.slice(
    project.indexOf('  SociusFitAutoMeals:'),
    project.indexOf('  SociusFitAutoMealsBackgroundUpload:')
  )
  const extensionTarget = project.slice(
    project.indexOf('  SociusFitAutoMealsBackgroundUpload:'),
    project.indexOf('schemes:')
  )

  assert.match(project, /DEVELOPMENT_TEAM: \$\(APPLE_TEAM_ID\)/)
  assert.doesNotMatch(projectSettings, /CODE_SIGN_IDENTITY/)
  for (const target of [hostTarget, extensionTarget]) {
    assert.match(
      target,
      /configs:\r?\n\s+Release:\r?\n\s+CODE_SIGN_IDENTITY: Apple Distribution/
    )
  }
  assert.match(project, /CODE_SIGN_STYLE: Manual/g)
  assert.match(project, /PROVISIONING_PROFILE_SPECIFIER: \$\(HOST_PROVISIONING_PROFILE_SPECIFIER\)/)
  assert.match(project, /PROVISIONING_PROFILE_SPECIFIER: \$\(EXTENSION_PROVISIONING_PROFILE_SPECIFIER\)/)
  assert.match(project, /BackgroundUploadURLBase: \$\(BACKGROUND_UPLOAD_URL_BASE\)/)
  assert.match(project, /BACKGROUND_UPLOAD_URL_BASE: https:\/\/example\.invalid/)
  assert.match(project, /APP_GROUP_ID: group\.com\.sociusfit\.automeals/)
  assert.match(project, /CODE_SIGN_ENTITLEMENTS: Supporting\/App\.entitlements/)
  assert.match(project, /CODE_SIGN_ENTITLEMENTS: Supporting\/BackgroundUpload\.entitlements/)
  assert.match(
    hostTarget,
    /- path: Supporting\/App\/PrivacyInfo\.xcprivacy\r?\n\s+buildPhase: resources/
  )
  assert.match(
    extensionTarget,
    /- path: Supporting\/BackgroundUpload\/PrivacyInfo\.xcprivacy\r?\n\s+buildPhase: resources/
  )
  assert.doesNotMatch(hostTarget, /^\s{4}resources:/m)
  assert.doesNotMatch(extensionTarget, /^\s{4}resources:/m)
  assert.match(project, /ITSAppUsesNonExemptEncryption: false/)
  assert.match(project, /UILaunchScreen: \{\}/)
  assert.match(project, /ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon/)
})

test('both native targets share only the approved diagnostic App Group', () => {
  for (const entitlements of [hostEntitlements, extensionEntitlements]) {
    assert.match(entitlements, /<key>com\.apple\.security\.application-groups<\/key>/)
    assert.match(entitlements, /<string>group\.com\.sociusfit\.automeals<\/string>/)
    assert.equal(
      (entitlements.match(/<string>group\./g) ?? []).length,
      1,
      'each target must contain exactly one App Group identifier'
    )
  }
  assert.match(workflow, /APP_GROUP_ID: group\.com\.sociusfit\.automeals/)
  assert.match(workflow, /com\.apple\.security\.application-groups/)
  assert.match(workflow, /profile_extra_app_group/)
  assert.match(workflow, /signed host app is missing the approved App Group/)
  assert.match(workflow, /signed extension is missing the approved App Group/)
})

test('both executables declare the App Group UserDefaults privacy reason', () => {
  for (const manifest of [hostPrivacyManifest, extensionPrivacyManifest]) {
    assert.match(manifest, /NSPrivacyAccessedAPICategoryUserDefaults/)
    assert.match(manifest, /<string>1C8F\.1<\/string>/)
    assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/)
  }
})

test('probe-only App Store icon is an opaque 1024-pixel PNG', () => {
  const manifest = JSON.parse(appIconManifest)
  assert.deepEqual(manifest.images, [{
    filename: 'AppIcon-1024.png',
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  }])
  assert.equal(appIcon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(appIcon.readUInt32BE(16), 1024)
  assert.equal(appIcon.readUInt32BE(20), 1024)
  assert.equal(appIcon[25], 2, 'PNG color type must be opaque truecolor')
})
