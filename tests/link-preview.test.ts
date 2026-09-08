import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  parseProductPage,
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
