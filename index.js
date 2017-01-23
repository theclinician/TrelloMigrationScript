#! /usr/bin/env node
const GitHubApi = require('github');
const fs = require('fs');
const _ = require('lodash');
const argv = require('minimist')(process.argv.slice(2));

const owner = argv['owner'];
if(!owner){
  throw new Error("Need an owner (--owner) to be specified");
}

const repository = argv['repository'];
if(!repository){
  throw new Error("Need a repository (--repository) to be specified");
}

const username = argv['username'];
if(!username){
  throw new Error("Need a GitHub username (--username) specified");
}

const password = argv['password'];
if(!password){
  throw new Error("Need a password (--password) for GitHub user specified");
}
const trelloFile = argv['trello'];
if(!trelloFile){
  throw new Error("Need an exported trello json (--trello) file specified");
}

let timeBetweenRequests = argv['delay'];
if(!timeBetweenRequests){
    timeBetweenRequests = 1000;
}

const resumeIssue = argv['resume'];

const github = new GitHubApi({
  debug: true,
  protocol: "https",
  host: "api.github.com",
})


const cards = {};

const trelloData = JSON.parse(fs.readFileSync(trelloFile, 'utf8'));

const lists = {};
for(const list of trelloData.lists){
  lists[list.id] = list.name;
}

const labelsById = {};
for(const label of trelloData.labels){
  labelsById[label.id] = label.name;
}

for(const card of trelloData.cards){

  const labels = [];
  if(card.idList){
    labels.push(lists[card.idList]);
  }
  for(const idLabel of card.idLabels){
    labels.push(labelsById[idLabel])
  }

  cards[card.id] = {

    title: card.name,
    body: card.desc,
    labels: labels,

    cardNumber : card.idShort,
    comments: [],
  };
}

for(const action of trelloData.actions){
  if(action.type === 'commentCard'){
    const cardId = action.data.card.id;
    cards[cardId].comments.push({
      date : action.date,
      epoch : new Date(action.date).getTime(),
      authorName: action.memberCreator.fullName,
      text : action.data.text
    });
  }
}

const sortedCards = _.values(cards).sort((a, b) => a.cardNumber - b.cardNumber);

let nextTimeout = 0;

for(const card of sortedCards){
  setTimeout(function(){
    uploadCard(card);
  }, nextTimeout);
  nextTimeout += (1 + card.comments.length) * timeBetweenRequests
}

function uploadCard(card){

  github.authenticate({
    type: "basic",
    username: username,
    password: password
  });
  github.issues.create({
    owner: owner,
    repo: repository,
    title: card.title,
    body : card.body,
    labels: card.labels
  }, (err, res) => {
    if(err) throw new Error("Error creating an issue");
    const issueNumber = res.number;
    const sortedComments = card.comments.sort((a, b) => a.epoch - b.epoch)
    let nextTimeout = 0;
    for(const comment of sortedComments){
        setTimeout(function(){
          uploadComment(comment, issueNumber)
        }, nextTimeout)
        nextTimeout += timeBetweenRequests;
    }
  })
}

function uploadComment(comment, issueNumber){
    github.authenticate({
        type: "basic",
        username: username,
        password: password
    });

    github.issues.createComment({
        owner: owner,
        repo: repository,
        number: issueNumber,
        body: `${comment.authorName} (${comment.date}):\n${comment.text}`
    });
}
