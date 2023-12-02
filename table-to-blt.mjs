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
* - shownames (optional) If true, show candidate names in the BLT. Default: false.
*
* For information about the BLT file format, see:
* https://github.com/Conservatory/openstv/blob/master/openstv/Help.html
*
* Assumptions:
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

async function main(file, nbseats, electionname, shownames = false) {
    if (isNaN(nbseats)) {
       throw new Error(`Required number of seats missing.`);
    }
    const dom = await JSDOM.fromFile(file);
    generateBLT(dom.window.document, nbseats, electionname);
}

function generateBLT (document, nbseats, electionname) {
  // NOTE: The first column is the name of the voter.
  const table = document.querySelector("table")

  const rows = [...table.querySelectorAll("tr")];
  // Use first row of table since zeroth row is all th.
  const nbcandidates = rows[1].querySelectorAll('td').length;

  // candidates is the list of candidate names, taken from the top (zeroth) row of the table.
  const candidates = [...rows[0].querySelectorAll('th')].map(s => s.textContent).slice(1) ;
    
  // Create ballots
  const ballots = generateBallots(document, rows, candidates);
  
  // Start output in BLT format
  // First row is number of candidates and number of seats
  console.log(`${nbcandidates} ${nbseats}`);  
  // List of ballots, each with weight "1" and ending with "0"
  console.log(ballots.map(s => "1 " + s.join(" ") + " 0").join("\n"));
  // Zero separator
  console.log("0");
  // Names of candidates, ignoring the first column.
  for (let i = 0; i < nbcandidates; i++) {
    console.log(shownames ? `"${candidates[i]}"` : `"Candidate ${i + 1}"`);
  }
  // Election name
  console.log(`"${electionname}"`);
}

function generateBallots(document, rows, candidates) {
    const ballots = [];

    // Handle rows. Ignore top (zeroth) row since that is candidate names.
    for (const row of rows.slice(1)) {
        // Handle cells in the row.
        const cells = row.querySelectorAll('td');
	const unranked = Array.from(cells).map(getVote);

        // Per OpenSTV, ballot is invalid if there are duplicate rankings.
        if (duplicateRankings(unranked)) {
	   console.error(`Ballot ignored (duplicate rankings): ${row.querySelector('th').textContent}`);
	   continue;
	}

        // Sort the candidates so the array of cells goes from top ranked (1) to lowest ranked.
        const rankedcells = unranked.toSorted((a,b) => a.rank - b.rank);	

        // Per OpenSTV, ballot is invalid if there are skips in rankings.
        if (skips(rankedcells)) {
	   console.error(`Ballot ignored (skips in rankings): ${row.querySelector('th').textContent}`);
	   continue;
	}

	const ordered = [];
	for (const cell of rankedcells) {
	    // Unranked candidates are demoted in the list by giving them very high rank (Infinity).
	    // Remove these candidates from the generated ballot.
	    if (cell.rank != Infinity) {
  	       ordered.push(candidates.indexOf(cell.candidate) + 1);
	    }
        }
	ballots.push(ordered);
    }
    return(ballots);
 }

function getVote (cell) {
  // WBS form generates "Ranked N" (most of the time). Remove "Ranked"
  const re1 = /.*\s+([0123456789])$/ ;
  const re2 = /\s*Unranked\s*/ ;
  const title = cell.getAttribute('title');

  // Missing title 
  if (!title) {
     throw new Error(`Cell ${cell.outerHTML} empty title attribute`);
  }

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
  const noUnranked = ballot.filter(v => v.rank != Infinity);
  const uniqueValues = new Set(noUnranked.map(v => v.rank));
  return (uniqueValues.size < noUnranked.length);
}

function skips(ballot) {
  // The ranks have been sorted here (with duplicate ballots thrown out).
  // Remove Infinity. Each remaining ranking should be equal to index + 1.
  return ballot.filter(v => v.rank != Infinity).some((v,i) => v.rank != (i + 1))
}

const file = process.argv[2];
const nbseats = process.argv[3];
const electionname = process.argv[4] === undefined ? ("Election " + new Date().toISOString().slice(0, 10)) : process.argv[4];
const shownames = process.argv[5] === undefined ? false : process.argv[5];

main(file, nbseats, electionname, shownames)
  .catch(err => {
    console.log(`Something went wrong: ${err.message}`);
    throw err;
  });
