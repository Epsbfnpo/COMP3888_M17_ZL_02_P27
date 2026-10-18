const db = require('./db');
const { access } = require('./security');
const { readProposal } = require('./proposal-api');
const assistant = require('./assistant').createAssistant({ db, access, readProposal });

module.exports = require('./assistant-router').createAssistantRouter({ assistant });
