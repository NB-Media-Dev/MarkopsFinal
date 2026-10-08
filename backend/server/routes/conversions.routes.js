const express = require('express');
const { dbTransactionsStore } = require('../db');

const router = express.Router();

router.get('/transactions', (req, res) => {
  return res.json(dbTransactionsStore);
});

module.exports = router;
