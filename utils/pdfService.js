const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');

/**
 * Generate PDF from EJS template
 * @param {string} templateName - Name of the template (without .ejs)
 * @param {Object} data - Data to inject into the template
 * @param {string} outputPath - Path to save the PDF (optional)
 * @returns {Promise<Buffer>} - PDF buffer
 */
const generatePDF = async (templateName, data, outputPath = null) => {
    let browser;
    try {
        const templatePath = path.join(process.cwd(), 'templates', `${templateName}.ejs`);
        
        // Render HTML using EJS
        const html = await ejs.renderFile(templatePath, data);

        // Launch Puppeteer
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // Set content and wait for it to be fully loaded
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0px',
                right: '0px',
                bottom: '0px',
                left: '0px'
            }
        });

        // Save to file if outputPath is provided
        if (outputPath) {
            const dir = path.dirname(outputPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(outputPath, pdfBuffer);
        }

        return pdfBuffer;
    } catch (error) {
        logger.error(`PDF Generation Error (${templateName}):`, error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

const amountToWords = (amount) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (num) => {
        if ((num = num.toString()).length > 9) return 'overflow';
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return '';
        let str = '';
        str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
        str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
        return str;
    };

    const n = Math.floor(amount);
    const paise = Math.round((amount - n) * 100);
    let res = inWords(n) + 'Rupees ';
    if (paise > 0) res += 'and ' + inWords(paise) + 'Paise ';
    return res + 'Only';
};

module.exports = {
    generatePDF,
    amountToWords
};
