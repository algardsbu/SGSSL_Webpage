import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';

test('pull-request validation has no deployment credentials or elevated permissions', async () => {
    const workflow = parse(await readFile(new URL('../.github/workflows/site.yml', import.meta.url), 'utf8'));
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.ok(Object.hasOwn(workflow.on, 'pull_request'));
    assert.equal(Object.hasOwn(workflow.on, 'pull_request_target'), false);
    const build = workflow.jobs.build;
    assert.doesNotMatch(JSON.stringify({ env: workflow.env, build }), /secrets\./i);
    assert.equal(build.environment, undefined);
    for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps) {
            // GitHub expressions belong in structured env, never in shell source.
            if (step.run) assert.doesNotMatch(step.run, /\$\{\{/);
        }
    }
});

test('production uploads require the main branch, successful artifact, and explicit deployment enablement', async () => {
    const workflow = parse(await readFile(new URL('../.github/workflows/site.yml', import.meta.url), 'utf8'));
    const deploy = workflow.jobs.deploy;
    assert.ok([deploy.needs].flat().includes('build'));
    assert.match(deploy.if, /github\.ref\s*==\s*'refs\/heads\/main'/);
    assert.match(deploy.if, /github\.event_name\s*!=\s*'pull_request'/);
    assert.match(deploy.if, /vars\.DEPLOY_ENABLED\s*==\s*'true'/);
    const concurrency = deploy.concurrency ?? workflow.concurrency;
    assert.equal(concurrency['cancel-in-progress'], false);
    assert.ok(concurrency.group);
    const artifact = deploy.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'));
    assert.equal(artifact.with.path, 'dist/');
    const retained = workflow.jobs.build.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    assert.equal(retained.with.path, 'dist/');
    assert.ok(retained.with['retention-days'] >= 1);
    const upload = deploy.steps.find((step) => /scripts\/deploy\.mjs/.test(step.run ?? ''));
    assert.ok(upload.env.SFTP_HOST_KEY_SHA256.includes('secrets.'));
    assert.ok(upload.env.SFTP_PASSWORD.includes('secrets.'));
    assert.ok(upload.env.SFTP_USERNAME.includes('secrets.'));
    for (const step of deploy.steps.filter((step) => step !== upload)) {
        assert.doesNotMatch(JSON.stringify(step), /secrets\./i);
    }
});

test('CMS defaults protect drafts, stable identifiers, and allowed image uploads', async () => {
    const cms = parse(await readFile(new URL('../.pages.yml', import.meta.url), 'utf8'));
    const articles = cms.content.find((entry) => entry.name === 'articles');
    const fields = Object.fromEntries(articles.fields.map((field) => [field.name, field]));
    assert.equal(articles.operations.rename, false);
    assert.equal(articles.filename.field, false);
    assert.equal(fields.id.readonly, true);
    assert.equal(fields.id.options.editable, false);
    for (const field of ['published', 'facebook', 'instagram']) assert.equal(fields[field].default, false, field);
    assert.ok(articles.view.fields.includes('published'));
    const allowed = new Set(['jpg', 'jpeg', 'png', 'webp']);
    const media = cms.media.find((entry) => entry.name === 'images');
    assert.equal(media.input, 'public/images');
    for (const extension of media.extensions) assert.ok(allowed.has(extension), extension);
    for (const extension of fields.image.options.extensions) assert.ok(allowed.has(extension), extension);
    assert.equal(fields.body.options.format, 'markdown');
});
