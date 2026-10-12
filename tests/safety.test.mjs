import test from 'node:test';
import assert from 'node:assert/strict';
import { mailLinks } from '../web/lib/safety.js';

test('mail links: mailto, Gmail and Outlook compose URLs carry subject and body', () => {
  const l = mailLinks({ to: 'a@b.fr', subject: 'Suite à notre échange', body: 'Bonjour,\nmerci.' });
  assert.equal(l.mailto, 'mailto:a%40b.fr?subject=Suite%20%C3%A0%20notre%20%C3%A9change&body=Bonjour%2C%0Amerci.');
  assert.match(l.gmail, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=a%40b\.fr&su=Suite/);
  assert.match(l.outlook, /^https:\/\/outlook\.office\.com\/mail\/deeplink\/compose\?to=a%40b\.fr&subject=Suite.*&body=Bonjour/);
  assert.equal(mailLinks({ subject: 'x' }).mailto, 'mailto:?subject=x');
});
