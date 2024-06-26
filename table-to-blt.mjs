/**
* This tool reads a file with a single table element in it and
* generates a BLT file as input to OpenSTV
* https://github.com/Conservatory/openstv
*
* The format of the table is that generated by a WBS rank-order
* control. The code assumes that the title attribute on each
* table cell includes both the rank information and the candidate.
*
* The rank-order control allows voters to leave candidates "Unranked".
*
* Arguments:
* - document: HTML file with a table with class including "results"; the code picks the first one because this is what WBS forms produce.
* - nbseats: The number of seats available for election
* - electionname (optional): The title that should appear in the BLT file (not semantically important).
* - sortballots (optional) If "true", sort ballots lexically so that BLT lines are not in same order as WBS table entries. It is useful to not sort ballots when debugging this code. Default: "true"
* - shownames (optional) If "true", show candidate names in the BLT. Default: "false".
*
* For information about the BLT file format, see:
* https://github.com/Conservatory/openstv/blob/master/openstv/Help.html
* 
* Data table assumptions
* - First row (except for zeroth cell) has th elements with candidate names.
* - First column (except for zeroth cell) has th elements with voter names
* - Other cells are td elements with votes. See getVote for more details.
*
* STV assumptions
* - Each ballot has a weight of 1.
* - OpenSTV says: You don't need to rank all of the candidates on each
*                 ballot, but you cannot skip rankings and you 
*                 cannot give two or more candidates the same ranking."
*   Therefore, we ignore ballots with gaps and ballots where two or
*   more candidates have the same ranking. However, we report these phenomena.
* - OpenSTV says: "OpenSTV only accepts valid ballots, and an empty
*   ballot is valid." Therefore we preserve empty ballots.
*/

import { JSDOM } from 'jsdom';

async function main(file, nbseats, electionname, sortballots = true, shownames = false) {
    if (isNaN(nbseats)) {
       throw new Error(`Required number of seats missing.`);
    }
    const dom = await JSDOM.fromFile(file);
    generateBLT(dom.window.document, nbseats, electionname, sortballots, shownames);
}

function generateBLT (document, nbseats, electionname, sortballots, shownames) {
  const table = document.querySelector("table.results")
  const rows = [...table.querySelectorAll("tr")];
  // Use first row of table since zeroth row is all th.
  const nbcandidates = rows[1].querySelectorAll('td').length;
  let candidates = [...rows[0].querySelectorAll('th')].map(s => s.textContent).slice(1) ;
  const re0 = /Candidate has withdrawn from the election:\s/ ;
  const withdrawn = candidates.map(c => c.match(re0) ? true : false) ;
  candidates = candidates.map(c => c.replace(re0,'')) ;
  const ballots = generateBallots(document, rows, candidates);
  
  // Generate BLT
  // First row is number of candidates and number of seats
  console.log(`${nbcandidates} ${nbseats}`);
  // Identify any withdrawn candidates. Multiple withdrawn
  // candidates can appear on one line, each with "-" next to
  // candidate number (e.g., -2 -3 -4).
  if (withdrawn.some(w => w)) {
    console.log(withdrawn.map((w,i) => w ? -(i + 1) + ' ': '').join(''));
  }
  // List of ballots, each with weight "1" and ending with "0"
  if (sortballots == "true") {
     console.log(ballots.sort().map(s => "1 " + s.join(" ") + " 0").join("\n"));
  } else {
     console.log(ballots.map(s => "1 " + s.join(" ") + " 0").join("\n"));  
  }
  // Zero separator
  console.log("0");
  // Names of candidates, ignoring the first column.
  for (let i = 0; i < nbcandidates; i++) {
    console.log(shownames == "true" ? `"${candidates[i].trim()}"` : `"Candidate ${i + 1}"`);
  }
  // Election name
  console.log(`"${electionname}"`);
}

function generateBallots(document, rows, candidates) {
    const ballots = [];

    // Ignore first row (candidate names)
    for (const row of rows.slice(1)) {
        // Handle cells in the row.
        const cells = row.querySelectorAll('td');
	const unranked = Array.from(cells).map(getVote);

        // Sort the candidates so the array of cells goes from top ranked (1) to lowest ranked. Remove any 'Infinity' rankings.
        const rankedcells = unranked.toSorted((a,b) => a.rank - b.rank).filter(v => v.rank != Infinity) ;

        // Per OpenSTV, ballot is invalid if there are duplicates or skips

        if (duplicateRankings(rankedcells)) {
	  console.error(`Ballot ignored (duplicate rankings): ${row.querySelector('th').textContent}`);
	} else if (skips(rankedcells)) {
          console.error(`Ballot ignored (skips in rankings): ${row.querySelector('th').textContent}`);
	} else {
	  const ordered = [];
	  for (const cell of rankedcells) {
              ordered.push(candidates.indexOf(cell.candidate) + 1);
          }
	  ballots.push(ordered);
        }
    }	
    return(ballots);
 }

function getVote (cell) {
  // WBS form generates "Ranked N" (most of the time). Remove "Ranked"
  const re1 = /.*\s+([0123456789])$/ ;
  const re2 = /\s*Unranked\s*/ ;
  const re3 = /Candidate has withdrawn from the election:\s/ ;
  let title = cell.getAttribute('title');

  // Missing title 
  if (!title) {
     throw new Error(`Cell ${cell.outerHTML} empty title attribute`);
  }

  // If candidate has withdrawn, remote that information from vote
  // information; withdrawn candidates are identified in BLT generation.
  title = title.replace(re3,'');

  const [ candidate, strRank ] = title.split(':');

  // Either candidate name or rank is missing.
  if (!candidate || !strRank) {
     throw new Error(`Cell ${cell.outerHTML} empty candidate or rank in title`);
  }

  const rank = strRank.match(re2) ? Infinity : parseInt(strRank.replace(re1, "$1"), 10);

  // Rank is not an integer.
  if (isNaN(rank)) {
     throw new Error(`Cell ${cell.outerHTML} rank is not an integer`);
  }

  return { candidate, rank };
}

function duplicateRankings(ballot) {
  // Input ballot is sorted (no Infinity).
  // In valid ballot, rank - index = 1.
  // Rank - index = 0 implies duplicate. (e.g., 1 2 2 3 or 1 2 3 3)
  return ballot.some((v,i) => (v.rank - i) == 0)
}

function skips(ballot) {
  // Input ballot is sorted (no Infinity).
  // In valid ballot, rank - index = 1.
  // Rank - index >= 2 implies skip. (e.g., 1 2 4 5 or 1 5 6)
  return ballot.some((v,i) => (v.rank - i) >= 2)
}

const file = process.argv[2];
const nbseats = process.argv[3];
const electionname = process.argv[4] === undefined ? ("Election " + new Date().toISOString().slice(0, 10)) : process.argv[4];
const sortballots = process.argv[5] === undefined ? "true" : process.argv[5];
const shownames = process.argv[6] === undefined ? "false" : process.argv[6];

main(file, nbseats, electionname, sortballots, shownames)
  .catch(err => {
    console.log(`Something went wrong: ${err.message}`);
    throw err;
  });
