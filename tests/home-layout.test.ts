import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('home page no longer displays a family application or invitation', () => {
  assert.doesNotMatch(home, /Заявка в семью|заявк[аи] в семью|family-invite|discord\.gg\/freakez/i);
  assert.doesNotMatch(styles, /family-invite/);
  assert.match(home, /Все разделы/);
  assert.match(home, /Для ежедневной работы/);
});

test('homepage clears the fixed header and centers inside the available desktop width', () => {
  assert.match(styles, /\.site-main\s*\{[^}]*padding-top:\s*104px/);
  assert.match(styles, /@media \(min-width:\s*1024px\)[\s\S]*?\.site-main-with-sidebar\s*\{/);
  assert.match(styles, /@media \(max-width:\s*760px\)[^\n]*\.site-main\s*\{\s*padding-top:\s*94px/);
  assert.match(app, /sidebarOpen \? ' site-main-with-sidebar'/);
});
