import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { emptyProfile, readProfile, validateProfile, profileDefault, profileDepartmentLabel, profileWriteValues, applyProfileDefaults, type Profile } from '../src/lib/profileData';
import { createProfileStore } from '../src/lib/profileStore';

const officer: Profile = { ...emptyProfile, game_nickname: 'Kira_Comis', static_id: '75463', department: 'ovk', department_status: 'verified', rank: 'Лейтенант' };
const otherOfficer: Profile = { ...officer, game_nickname: 'Pavel_Mironov', static_id: '91342', department: 'dps' };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('OVK and UDK autofill every department form; legacy USB profiles resolve to OVK', () => {
  for (const department of ['ovk', 'udk']) {
    const profile = { ...officer, department };
    assert.deepEqual(validateProfile(profile), {});
    for (const field of ['achievementDepartment', 'sourceDepartment', 'promotionDepartment'] as const) assert.equal(profileDefault(profile, field), department);
    assert.equal(profileDefault({ ...profile, department_status: 'none' }, 'sourceDepartment'), '');
  }
  assert.equal(readProfile({ ...officer, department: 'usb' }).department, 'ovk');
  assert.equal(profileDepartmentLabel('ovk'), 'ОВК | Отдел внутреннего контроля');
  assert.equal(profileDepartmentLabel('udk'), 'УДК | Управление дорожного контроля');
  for (const department of ['usb', 'udo', 'ukm']) assert.equal(profileDefault({ ...officer, department }, 'achievementDepartment'), '');
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('profile requires nickname and static ID; unavailable automatic departments do not block saving', () => {
  assert.deepEqual(validateProfile(officer), {});
  assert.deepEqual(validateProfile({ ...officer, game_nickname: '  Кира Комиссарова  ', static_id: ' 00012 ' }), {});
  for (const patch of [{ game_nickname: 'ab' }, { game_nickname: 'x'.repeat(81) }, { game_nickname: 'Name\nName' },
    { static_id: '#123' }, { static_id: '1e4' }, { static_id: '12345678901' }, { static_id: '' },
    { department: 'administrator' }, { about: 'x'.repeat(1001) }]) {
    assert.ok(Object.keys(validateProfile({ ...officer, ...patch })).length, JSON.stringify(patch));
  }
  const fields = profileWriteValues({ ...officer, game_nickname: ' Kira_Comis ', static_id: ' 75463 ', updated_at: 'forged' });
  assert.equal(fields.game_nickname, 'Kira_Comis');
  assert.equal(fields.static_id, '75463');
  assert.ok(!('updated_at' in fields));
  assert.ok(!('department' in fields));
  assert.ok(!('department_status' in fields));
  assert.deepEqual(validateProfile({ ...officer, department: '', department_status: 'none' }), {});
  assert.deepEqual(readProfile({ ...officer, id: 'another-user', discord_id: 'forged', role: 'admin' }), officer);
});

test('profile defaults match each form format and filter departments by the form allowlist', () => {
  assert.equal(profileDefault(officer, 'combined'), 'Kira_Comis | 75463');
  assert.equal(profileDefault({ ...officer, static_id: '' }, 'combined'), '');
  assert.equal(profileDefault(officer, 'nickname'), 'Kira_Comis');
  assert.equal(profileDefault(officer, 'staticId'), '75463');
  assert.equal(profileDefault(officer, 'departmentLabel'), 'ОВК');
  for (const department of ['academy', 'ukm']) assert.equal(profileDefault({ ...officer, department }, 'achievementDepartment'), '');
  assert.equal(profileDefault({ ...officer, department: 'gu' }, 'sourceDepartment'), '');
  for (const department of ['gu', 'ukm']) assert.equal(profileDefault({ ...officer, department }, 'promotionDepartment'), '');
  const form = applyProfileDefaults({ reporter: '', offender: '', source: '', target: '', evidence: '' }, [], officer,
    { reporter: 'combined', source: 'sourceDepartment' });
  assert.deepEqual(form, { reporter: 'Kira_Comis | 75463', offender: '', source: 'ovk', target: '', evidence: '' });
});

function hookFixture() {
  let stored: unknown;
  let userId: string | null = 'a';
  let profile = emptyProfile;
  const context = createContext({
    useAuth: () => ({ user: userId ? { id: userId } : null }), useProfile: () => ({ profile }),
    applyProfileDefaults, Set,
    useState: (initial: () => unknown) => {
      stored ??= initial();
      return [stored, (action: unknown) => { stored = typeof action === 'function' ? action(stored) : action; }];
    },
  });
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/useProfileForm.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*$/gm, '').replace(/export /g, '');
  runInContext(code, context);
  const render = () => runInContext("useProfileForm({name:'', static:'', department:'', evidence:''}, {name:'nickname', static:'staticId', department:'achievementDepartment'})", context);
  return { render, setProfile: (value: Profile) => { profile = value; }, setUser: (id: string | null) => { userId = id; } };
}

test('a slow profile load never overwrites typed or deliberately cleared fields; reset restores saved defaults', () => {
  const app = hookFixture();
  let [form, setForm] = app.render();
  setForm({ ...form, name: 'Manual_Name', evidence: 'https://example.test/proof' });
  app.setProfile(officer);
  [form, setForm] = app.render();
  assert.equal(form.name, 'Manual_Name');
  assert.equal(form.static, '75463');
  assert.equal(form.department, 'ovk');
  assert.equal(form.evidence, 'https://example.test/proof');
  setForm({ ...form, static: '' });
  assert.equal(app.render()[0].static, '');
  app.render()[2]();
  assert.deepEqual(JSON.parse(JSON.stringify(app.render()[0])), { name: 'Kira_Comis', static: '75463', department: 'ovk', evidence: '' });
});

test('account changes and logout discard the previous form draft and all its personal fields', () => {
  const app = hookFixture();
  app.setProfile(officer);
  const [form, setForm] = app.render();
  setForm({ ...form, evidence: 'private-proof', name: 'Manual_Name' });
  app.setUser('b'); app.setProfile(emptyProfile);
  assert.deepEqual(JSON.parse(JSON.stringify(app.render()[0])), { name: '', static: '', department: '', evidence: '' });
  app.setProfile(otherOfficer);
  assert.equal(app.render()[0].name, 'Pavel_Mironov');
  assert.equal(app.render()[0].evidence, '');
  app.setUser(null); app.setProfile(emptyProfile);
  assert.equal(app.render()[0].name, '');
});

test('all profile consumers share one load and late responses cannot cross account boundaries', async () => {
  const a = deferred<Profile>(); const b = deferred<Profile>(); const loaded: string[] = [];
  const store = createProfileStore({ load: id => { loaded.push(id); return id === 'a' ? a.promise : b.promise; }, save: async (_id, profile) => profile });
  store.activate('a'); store.activate('a'); store.activate('a');
  assert.deepEqual(loaded, ['a']);
  store.activate('b'); b.resolve(otherOfficer); await tick(); a.resolve(officer); await tick();
  assert.equal(store.getSnapshot().userId, 'b');
  assert.equal(store.getSnapshot().profile.static_id, '91342');
  store.activate(null);
  assert.equal(store.getSnapshot().profile.game_nickname, '');
});

test('saving updates every subscriber, preserves old profile details and ignores completion after logout', async () => {
  const pending = deferred<Profile>();
  const store = createProfileStore({ load: async () => officer, save: async () => pending.promise });
  let notifications = 0; store.subscribe(() => { notifications++; });
  store.activate('a'); await tick();
  const saved = store.save('a', otherOfficer); pending.resolve(otherOfficer); await saved;
  assert.equal(store.getSnapshot().profile.rank, 'Лейтенант');
  assert.equal(store.getSnapshot().profile.game_nickname, 'Pavel_Mironov');
  assert.ok(notifications >= 3);
  const late = deferred<Profile>();
  const second = createProfileStore({ load: async () => officer, save: async () => late.promise });
  second.activate('a'); await tick();
  const result = second.save('a', otherOfficer);
  second.activate(null); late.resolve(otherOfficer);
  await assert.rejects(result, /Аккаунт изменился/);
  assert.equal(second.getSnapshot().profile.game_nickname, '');
});

test('load and save failures stay visible and never publish a successful save', async () => {
  let unavailable = true;
  const store = createProfileStore({ load: async () => { if (unavailable) throw new Error('offline'); return officer; }, save: async () => { throw new Error('offline'); } });
  store.activate('a'); await tick();
  assert.equal(store.getSnapshot().status, 'error');
  unavailable = false; await store.reload('a');
  await assert.rejects(store.save('a', otherOfficer), /offline/);
  assert.equal(store.getSnapshot().profile.game_nickname, 'Kira_Comis');
});
