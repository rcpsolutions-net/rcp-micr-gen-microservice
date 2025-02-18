const dotenv = require('dotenv');

dotenv.config();

const fs =  require('fs');
const express = require('express');
const path = require('path')

const pngImageFactory = require('./micr-to-png');
const pdfPaystubFactory = require('./paystub_builder'); 

const app = express();
const port = process.env.PORT || 3031;

const defaultRoutingNumber = process.env.RCP_CHECK_ROUTING_NUMBER ?? '123456789';
const defaultAccountNumber = process.env.RCP_CHECK_ACCOUNT_NUMBER ?? '123456000' // yes we need to support multiple accounts


const verifyKey = (req) => {
    let key = req.headers['x-rcp-api-key'];

    return key === process.env.RCP_API_KEY;
}

app.get('/api/rcp-solutions/micr-gen', (req, res) => {

    if( !verifyKey(req) ) {
        return res.status(401).send('Unauthorized');
    }

    let { checkNumber, routingNumber = defaultRoutingNumber, accountNumber = defaultAccountNumber } = req.query;

    if (!checkNumber || !routingNumber || !accountNumber) {

        res.status(400).send('Missing required parameters.');

    } else {
        let buf = pngImageFactory.generateMICRLinePng(checkNumber, routingNumber, accountNumber);

        console.log('--- Generated MICR line image for check #: ', checkNumber);

        res.set('Content-Type', 'image/png');

        res.send(buf);
    }
});

app.get('/api/rcp-solutions/logo', (req, res) => {
    const imagePath = path.join(__dirname, 'images', 'company_watermark.png');

    res.sendFile(imagePath);
});

app.get('/api/rcp-solutions/sig', (req, res) => {
    if( !verifyKey(req) ) {
      return res.status(401).send('Unauthorized');
    }

    const imagePath = path.join(__dirname, 'images', 'new_check_signature.png');

    res.sendFile(imagePath);
});

app.get('/api/rcp-solutions/rcp/legacy/paystub/:checkNumber', async (req, res) => {
    const checkNumber = req.params.checkNumber;
  
    /**
    if( !verifyKey(req) ) {
      return res.status(401).send('Unauthorized');
    }
    **/

    let num = Number(checkNumber ?? null);

    if( Number.isNaN(num) ) {
        return res.status(400).send({ error: true, message: 'No valid checkNumber provided' });
    }
    
    console.log('--- Looking up Check #', num);

    let pdfFilename = await pdfPaystubFactory.generatePDFByCheckNumber({ checkNumber: num });

    if( pdfFilename === -1 ) {
        return res.status(404).send({ error: true, message: 'No checkNumber record found' });
    }

    let pdf = fs.readFileSync(pdfFilename);
    res.contentType("application/pdf");

    res.send(pdf);
});

app.get('/api/rcp-solutions/rcp/legacy/paystub/:checkNumber/:AIdent', async (req, res) => {
    const checkNumber = req.params.checkNumber;
    const AIdent = req.params.AIdent;

    if( !verifyKey(req) ) {
      return res.status(401).send('Unauthorized');
    }

    let num = Number(checkNumber ?? null);

    if( Number.isNaN(num) ) {
        return res.status(400).send({ error: true, message: 'No valid checkNumber provided' });
    }
    
    console.log('--- Looking up Check #', num);

    let pdfFilename = await pdfPaystubFactory.generatePDFByCheckNumber({ checkNumber: num, AIdent });

    if( pdfFilename === -1 ) {
        return res.status(404).send({ error: true, message: 'No checkNumber record found' });
    }

    let pdf = fs.readFileSync(pdfFilename);
    res.contentType("application/pdf");
    res.send(pdf);
});



app.listen(port, () => {
    console.log(`MICR/Paystub image factory is running on port ${port}.`);
});

module.exports = app;

