/* set by mocha when running the test harness */
/* global describe, it */

import { JSDOM } from 'jsdom';
import  assert from 'assert';
import { main } from '../table-to-blt.mjs';


describe("The BLT converter", () => {
  it("produces the expected output on all samples", async () => {
    const sampleFiles = ["test/sample-table-dup-rankings.html", "test/sample-table-skips.html", "test/sample-table.html"];

    const nbseats = 3;
    const electionname = "Election 2023-12-04";
    const sortballots = false;
    const shownames = false;

    for (let file of sampleFiles) {
      const dom = await JSDOM.fromFile(file);
      const expectedBltOutput = dom.window.document.querySelector("pre").textContent.trim();
      const expectedWarningsOutput = dom.window.document.querySelector("pre.warnings")?.textContent.trim() ?? "";
      const [actualBltLines, actualWarnings] = await main(file, nbseats, electionname, sortballots, shownames);
      assert.equal(actualBltLines.join("\n"), expectedBltOutput, `The actual output of running on ${file} matches the documented expected output`);
      assert.equal(actualWarnings.join("\n"), expectedWarningsOutput, `The warnings from running on ${file} matches the expected warnings`);
    }
  });
});
