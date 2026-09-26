import assert from "node:assert/strict";
import { validateUsername } from "./content-policy";

const allowed = ["Analyst", "Hancock", "good.name"];
const refused = ["d1ck_99", "Admin", "ab"];

for (const username of allowed) assert.equal(validateUsername(username), null, `${username} should be allowed`);
for (const username of refused) {
  assert.equal(
    validateUsername(username),
    "That username isn't allowed. Try another one.",
    `${username} should be refused`,
  );
}

console.log("content-policy username tests: PASS");