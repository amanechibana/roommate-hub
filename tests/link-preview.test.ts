import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedPort,
  decodeEntities,
  parseProductPage,
  privateAddress,
  privateIPv4,
  publicHostname,
} from "../lib/link-preview";

test("title comes from og:title, twitter:title, then the title tag", () => {
  assert.equal(
    parseProductPage(
      '<meta property="og:title" content="Fancy Olive Oil"/><title>Store</title>',
    ).title,
    "Fancy Olive Oil",
  );
  assert.equal(
    parseProductPage(
      '<meta content="Tea Kettle" name="twitter:title"><title>Store</title>',
    ).title,
    "Tea Kettle",
  );
  assert.equal(
    parseProductPage("<title>  Plain \n Page </title>").title,
    "Plain Page",
  );
  assert.equal(parseProductPage("<p>no signals</p>").title, null);
});

test("titles decode entities, collapse whitespace, and cap at 160 chars", () => {
  assert.equal(
    parseProductPage(
      '<meta property="og:title" content="Mr &amp; Mrs&#39;s &#x2764; Mug">',
    ).title,
    "Mr & Mrs's ❤ Mug",
  );
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
  const long = "x".repeat(300);
  assert.equal(parseProductPage(`<title>${long}</title>`).title!.length, 160);
});

test("price reads meta tags, JSON-LD, and Amazon offscreen markup", () => {
  assert.equal(
    parseProductPage('<meta property="og:price:amount" content="1,299.99">')
      .price,
    1299.99,
  );
  assert.equal(
    parseProductPage('{"@type":"Product","price":"18.50"}').price,
    18.5,
  );
  assert.equal(
    parseProductPage('<span class="a-offscreen">$12.99</span>').price,
    12.99,
  );
  assert.equal(parseProductPage("<p>no price here</p>").price, null);
});

test("non-USD prices are dropped instead of shown as dollars", () => {
  assert.equal(
    parseProductPage(
      '<meta property="og:price:amount" content="18.50"><meta property="og:price:currency" content="EUR">',
    ).price,
    null,
  );
  assert.equal(
    parseProductPage('{"price":"18.50","priceCurrency":"USD"}').price,
    18.5,
  );
});

test("nonsense prices are rejected", () => {
  for (const bad of ["0", "-4", "1e400", "999999999999"])
    assert.equal(
      parseProductPage(`<meta property="og:price:amount" content="${bad}">`)
        .price,
      null,
      bad,
    );
});

test("only plain public hostnames pass the fetch guard", () => {
  for (const good of ["www.amazon.com", "store.example.co.uk"])
    assert.equal(publicHostname(good), true, good);
  for (const bad of [
    "localhost",
    "api.localhost",
    "printer.local",
    "vault.internal",
    "127.0.0.1",
    "10.0.0.5",
    "169.254.169.254",
    "[::1]",
    "intranet",
    "",
  ])
    assert.equal(publicHostname(bad), false, bad);
});

test("only default web ports are fetchable", () => {
  for (const good of ["https://a.com", "https://a.com:443", "http://a.com:80"])
    assert.equal(allowedPort(new URL(good)), true, good);
  for (const bad of [
    "https://a.com:8443",
    "http://a.com:81",
    "http://a.com:6379",
  ])
    assert.equal(allowedPort(new URL(bad)), false, bad);
});

test("private, reserved, and malformed IPv4 addresses are rejected", () => {
  // Covers names like 127.0.0.1.nip.io: the resolver checks what they resolve to.
  for (const bad of [
    "0.0.0.0",
    "127.0.0.1",
    "10.0.0.5",
    "100.64.0.1",
    "100.127.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "256.1.1.1",
    "1.2.3",
    "",
  ])
    assert.equal(privateIPv4(bad), true, bad);
  for (const good of [
    "1.1.1.1",
    "8.8.8.8",
    "100.63.0.1",
    "172.32.0.1",
    "23.185.0.4",
  ])
    assert.equal(privateIPv4(good), false, good);
});

test("private and reserved IPv6 addresses are rejected", () => {
  for (const bad of [
    "::1",
    "::",
    "[::1]",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1%en0",
    "::ffff:127.0.0.1",
    "::ffff:192.168.1.1",
    "not-an-ip:",
  ])
    assert.equal(privateAddress(bad), true, bad);
  for (const good of [
    "2606:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])
    assert.equal(privateAddress(good), false, good);
  assert.equal(privateAddress("8.8.8.8"), false);
  assert.equal(privateAddress("192.168.1.1"), true);
});
