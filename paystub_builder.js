const fs = require('fs');
const sql = require('mssql');
const pdf = require('pdf-lib');

const __OUTPUT_PDF_FILE__ = './pdfs/paystubTestOutputForCheck-#.pdf';

let pngImageMap = {};

let courier, courierBold, timesRoman, timesRomanBold, helvetica, helveticaBold; 

let checkData = null;

const sqlConfig = {
    user: process.env.RCP_SQL_USER,
    password: 'espGTO3ed@w@#!',
    database: process.env.RCP_SQL_DATABASE,
    server: process.env.RCP_SQL_SERVER,
    encrypt: false,
    pool: {
        max: 30,
        min: 0,
        idleTimeoutMillis: 30000
    }
}

const appPool = new sql.ConnectionPool(sqlConfig);

let sqlPool = null;

const connectMSSQL = async () => {
    return new Promise((resolve, reject) => {
        appPool.connect().then((pool) => {
            console.log('--- MS-SQL AppPool Connected to SQL Server');

            sqlPool = pool;

            resolve(true);
        }).catch(err => {
            console.log('Database Connection Failed! Bad Config: ', err);

            resolve(false);
        });
    });
}

const SQLDate = (date) => {
    return (date.getFullYear()) + '-' + (date.getMonth() + 1) + '-' + (date.getDate() + 1); 
}

const SQLDateUS = (date) => {
    return (date.getMonth() + 1) + '/' + (date.getDate() + 1) + '/' + (date.getFullYear() - 2000);
}

const SQLDateFullYear = (date) => {
    return (date.getMonth() + 1) + '/' + (date.getDate() + 1) + '/' + (date.getFullYear());
}


const getPrCheckRootData = async (checkNumber) => {
    let query = `SELECT ChkId, CheckNumber, cr.AIdent, CheckDate, WeekendBill, YearID,
EmpName, cr.EINC, PayeeType, Gross, EmployeeTaxes, TotalAdjustments, Net, ProcessDate,
PayRate, RHours, OHours, DHours, Salary, AdjGrossMisc, AddressBox, Reserved1, Reserved2, Reserved3
YTDGross, AdjPriorWeek, Misc1, Misc2, Misc3, ReplacedByChkId, ReplacesChkId, TxnsMaxBranchName, TxnsMaxCompanyIdent,
Benefits, TxnsMaxCustName, TxnsMaxDeptName, emp.Active, emp.AdditionalWH, emp.BranchId, emp.SSN, emp.Birthday
FROM PrCheckRoot cr, EmployeeRoot emp
WHERE cr.CheckNumber = ${checkNumber} AND cr.AIdent = emp.AIdent`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }
};

const getPrCheckRootDataWithAIdent = async (checkNumber, AIdent) => {
    let query = `SELECT ChkId, CheckNumber, cr.AIdent, CheckDate, WeekendBill, YearID,
EmpName, cr.EINC, PayeeType, Gross, EmployeeTaxes, TotalAdjustments, Net, ProcessDate,
PayRate, RHours, OHours, DHours, Salary, AdjGrossMisc, AddressBox, Reserved1, Reserved2, Reserved3
YTDGross, AdjPriorWeek, Misc1, Misc2, Misc3, ReplacedByChkId, ReplacesChkId, TxnsMaxBranchName, TxnsMaxCompanyIdent,
Benefits, TxnsMaxCustName, TxnsMaxDeptName, emp.Active, emp.AdditionalWH, emp.BranchId, emp.SSN, emp.Birthday
FROM PrCheckRoot cr, EmployeeRoot emp
WHERE cr.CheckNumber = ${checkNumber} AND cr.AIdent = ${AIdent} AND cr.AIdent = emp.AIdent`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }
};


let = getAccruedValuesData = async (CheckNumber, AIdent) => {
    let query = `SELECT DISTINCT(al.EmpAccGUID), ROUND(SUM(al.Amount), 2) as totalAmount FROM
PrEmployeeAccrueItemRoot al, PrCheckRoot cr 
WHERE al.ChkID = cr.ChkId
AND al.AIdent = ${AIdent}
AND cr.CheckNumber = ${CheckNumber}
AND al.ModifiedWeekendDate <= cr.ProcessDate
GROUP BY al.EmpAccGUID ORDER BY al.EmpAccGUID`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }    
}

let getAccruedValueTotalUsedUpToCheckDate = async (CheckDate, AIdent, CheckNumber) => {
    let query = `DECLARE @SpecificDate DATE;
DECLARE @UserID INT;

SET @SpecificDate = '${CheckDate}'; 
SET @UserID = ${AIdent};

WITH PrEmpCalcBalance AS (
    SELECT 
        PEAI.EmpAccGUID,
        ROUND(SUM(CASE WHEN PEAI.Amount <> 1 AND peai.ModifiedWeekendDate < @SpecificDate THEN PEAI.Amount ELSE 0 END), 2) AS  Balance,
        ROUND(SUM(CASE WHEN PEAI.IsAccrue = 1 AND peai.ModifiedWeekendDate < @SpecificDate THEN PEAI.Amount ELSE 0 END), 2) AS Accrued,
        ROUND(SUM(
            CASE 
                WHEN PEAI.IsDeplete = 1 AND peai.ModifiedWeekendDate < @SpecificDate				
                THEN -PEAI.Amount 
                ELSE 0 
            END
        ), 2) AS DepletedThisYear,
        ROUND(SUM(CASE WHEN PEAI.IsManualAdjustment = 1 AND PEAI.ModifiedWeekendDate < @SpecificDate THEN PEAI.Amount ELSE 0 END), 2) AS ManualAdjustments
    FROM 
        dbo.PrEmployeeAccrueItemRoot AS PEAI WITH (NOLOCK)
    LEFT OUTER JOIN 
        dbo.PrEmployeeAccrueTierRoot AS PEATR WITH (NOLOCK) ON PEATR.EmpAccTierGUID = PEAI.EmpAccTierGUID
    INNER JOIN 
        dbo.PrEmployeeAccrueRoot AS PEAR WITH (NOLOCK) ON PEAR.EmpAccGUID = PEAI.EmpAccGUID
    INNER JOIN 
        dbo.PrAccrueRoot AS PAR WITH (NOLOCK) ON PAR.AccGUID = PEAR.AccGUID
    
    WHERE PEAR.Aident = @UserID AND PEAI.ModifiedWeekendDate < @SpecificDate
    GROUP BY 
        PEAI.EmpAccGUID
),
EligibilityMet AS (
    SELECT 
        PEAR.EmpAccGUID
    FROM 
        dbo.PrAccrueRoot AS PAR
    INNER JOIN 
        dbo.PrEmployeeAccrueRoot AS PEAR ON PAR.AccGUID = PEAR.AccGUID
    INNER JOIN 
        dbo.PrEmployeeAccrueItemRoot AS PEAI ON PEAI.EmpAccGUID = PEAR.EmpAccGUID
    WHERE 
        @SpecificDate >= DATEADD(DAY, PAR.EligibleBalanceDelayDays, PEAI.ModifiedWeekendDate)
        OR PAR.EligibleBalanceDelayDays = 0
    GROUP BY 
        PEAR.EmpAccGUID
),
BalanceDetails AS (
    SELECT 
        PEAR.EmpAccGUID,
        ISNULL(PECB.Balance, 0) AS Balance,
        CASE WHEN EM.EmpAccGUID IS NOT NULL THEN ISNULL(PECB.Balance, 0) ELSE 0 END AS EligibleBalance
    FROM 
        dbo.PrEmployeeAccrueRoot AS PEAR WITH (NOLOCK)
    LEFT OUTER JOIN 
        PrEmpCalcBalance AS PECB WITH (NOLOCK) ON PEAR.EmpAccGUID = PECB.EmpAccGUID
    LEFT OUTER JOIN 
        EligibilityMet AS EM ON EM.EmpAccGUID = PEAR.EmpAccGUID
),
AccruedThisCheck AS (
    SELECT 
        DISTINCT(al.EmpAccGUID),
        ROUND(SUM(al.Amount), 2) AS accruedThisCheck
    FROM
        PrEmployeeAccrueItemRoot al, PrCheckRoot cr 
    WHERE al.ChkID = cr.ChkId
    AND cr.CheckNumber = ${CheckNumber}
    AND al.AIdent = cr.AIdent
    AND al.ModifiedWeekendDate <= cr.ProcessDate
    GROUP BY al.EmpAccGUID
)
SELECT 
    PAR.AccGUID,
    PAR.Name,
    PAR.DESCRIPTION,
    PAR.Active AS AccrueActive,
    PEAR.Active AS EmpAccrueActive,
    PEAR.EmpAccGUID,
    PEAR.Aident,
    BalanceDetails.Balance,
    BalanceDetails.EligibleBalance,
    ISNULL(AccruedThisCheck.accruedThisCheck, 0) AS AccruedThisCheck,
    ISNULL(PECB.Accrued, 0) AS Accrued,
    ISNULL(PECB.DepletedThisYear, 0) AS Depleted,
    ISNULL(PECB.ManualAdjustments, 0) AS ManualAdjustments,
    CASE 
        WHEN ISNULL(PAR.AnnualDepletionLimit, 0) = 0 THEN BalanceDetails.EligibleBalance
        ELSE 
            CASE 
                WHEN BalanceDetails.EligibleBalance > PAR.AnnualDepletionLimit - PECB.DepletedThisYear THEN PAR.AnnualDepletionLimit - PECB.DepletedThisYear
                ELSE BalanceDetails.EligibleBalance
            END
    END AS AvailableBalance
FROM 
    dbo.PrAccrueRoot AS PAR WITH (NOLOCK)
INNER JOIN 
    dbo.PrEmployeeAccrueRoot AS PEAR ON PAR.AccGUID = PEAR.AccGUID
LEFT OUTER JOIN 
    PrEmpCalcBalance AS PECB ON PEAR.EmpAccGUID = PECB.EmpAccGUID
LEFT OUTER JOIN 
    BalanceDetails ON BalanceDetails.EmpAccGUID = PEAR.EmpAccGUID
LEFT OUTER JOIN 
    AccruedThisCheck ON AccruedThisCheck.EmpAccGUID = PEAR.EmpAccGUID
WHERE PEAR.Aident = @UserID AND PEAR.Active = 1;`;

//console.log(query);

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }    
}

let = getCheckTaxesPaid = async (CheckID) => {
    let query = `SELECT pt.JurisGross, pt.AmountTaxable, pt.AmountTax, pt.PSDCode, pt.ChkId, pt.Allowances, pt.DependentAllowance,
tr.CompatibleJuris, tr.CompatibleJurisDescription, tr.Description, tr.W2Label, tr.W2Box
FROM PrCheckTaxRoot pt, PrTaxRoot tr
WHERE pt.ChkId = ${CheckID}
AND pt.JurisId = tr.JurisID
AND tr.PdByEmployee = 1`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }    
}

llet = getYTDTaxesPaid = async (CheckDate, AIdent, YearID) => {
    let query = `
    SELECT DISTINCT(pctr.JurisId), prtr.Juris, SUM(AmountTax) AS totalEmployeePaid, SUM(AmountTaxable) as YTDTaxable
    FROM PrCheckTaxRoot pctr, PRTaxRoot prtr, PrCheckRoot pcr 
    WHERE pctr.AIdent = ${AIdent}
    AND pcr.YearID = ${YearID}
    AND pcr.ChkId = pctr.chkId
    AND pcr.CheckDate <= '${CheckDate}'
    AND pctr.JurisId = prtr.JurisId
    AND prtr.PdByEmployee = 1
    GROUP by pctr.JurisId, prtr.Juris`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }    
}

let = getPayrollTxnsData = async (CheckId, AIdent) => {
    let query = `SELECT TOP 20 TxnId, tx.AddrID, CustomerName, DepartmentName, CustomerId, OrigItemid, PayRate,
    WeekEndDate, Units, RHours, OHours, DHours, THours, Salary, tx.PcIdent, pc.Description, pc.CountAsHoursWorked, 
    pc.CountTowards80Hours, BranchID, UnitPayRate, AdjGrossMisc, Gross, ChkId, EINC, PeriodStartDate, PeriodEndDate
    FROM TxnsRoot tx, PrPayCodeRoot pc WHERE pc.PcIdent = tx.PcIdent AND tx.AIdent = ${AIdent} AND tx.ChkId = ${CheckId}`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }    
}

getPrCheckAdjsForUser = async (CheckId, AIdent) => {
    let query = `SELECT TOP 10 car.*, adj.AdjName
    FROM PrCheckAdjRoot car, PrEmployeeAdjRoot ear, PrAdjRoot adj
    WHERE 
        car.PrEmployeeAdjId = ear.Id
        AND car.AdjId = adj.AdjId
        AND car.AIdent = ${AIdent} 
        AND car.ChkId = ${CheckId}
    UNION ALL
    SELECT TOP 10 car.*, adj.AdjName
    FROM PrCheckAdjRoot car, PrAdjRoot adj
    WHERE  
        car.AIdent = ${AIdent}
        AND car.AdjId = adj.AdjId        
        AND car.ChkId = ${CheckId} 
        AND car.PrEmployeeAdjId = -1;`;

        try {
            const results = await sqlPool.request().query(query);
    
            return results;
        }
        catch (err) {
            console.log(err);
    
            return err;
        }   
};

getPrChkAdjsYTDForUser = async (CheckDate, AIdent) => {
    let query = `SELECT SUM(Amount) as ytdTotal, SUM(BenefitAmount) as ytdBenefitTotal, adj.AdjId, adj.AdjName FROM PrCheckAdjRoot car, PrEmployeeAdjRoot ear, PrAdjRoot adj
WHERE car.AdjId = adj.AdjId
AND car.PrEmployeeAdjId = ear.Id
AND car.AIdent = ${AIdent}
AND car.WeekendBillAccrued <= '${CheckDate}'
GROUP BY adj.AdjId, adj.AdjName`;

try {
    const results = await sqlPool.request().query(query);

    return results;
}
catch (err) {
    console.log(err);

    return err;
}   
}

getPrRateAtCheckDate = async (CheckDate, AIdent) => {
    let query = `DECLARE @checkDate DATE;
    SET @checkDate = '${CheckDate}';

    SELECT TOP 1 ItemID, OrigItemid as AssignmentNumber, OrderID, AIdent, StartDate, PayRate, OTPayRate, DTPayRate, EndDate, ExpectedEndDate, WhenAssigned
    FROM AssignmentRoot ar
    WHERE 
        ar.AIdent = ${AIdent}
        AND ar.StartDate <= @checkDate
        AND (ar.EndDate >= @checkDate OR ar.EndDate IS NULL)
    ORDER BY ar.EndDate DESC, ar.StartDate DESC;`;
    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }   
}

getCompanyRootData = async (EINC) => {
    let query = `SELECT EINC, Active, FullCompanyName, DepartmentName, Street1, Street2, City, 
    cr.State, ZipCode, Country, CompanyPhone, FedEmployerID, RootCompanyIdent FROM CompanyRoot cr 
    WHERE EINC = ${EINC}`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }   
}

getYTDSumsForUser = async (CheckDate, AIdent, YearID) => {
    let query = `SELECT SUM(Gross) as ytdGross, SUM(Net) AS ytdNet FROM PrCheckRoot cr
WHERE cr.AIdent = ${AIdent}
AND cr.YearID = ${YearID}
AND cr.CheckDate <= '${CheckDate}'`;

    try {
        const results = await sqlPool.request().query(query);

        return results;
    }
    catch (err) {
        console.log(err);

        return err;
    }   
}

let embedFonts = async (doc) => {
    let fonts = pdf.StandardFonts;

    courier = await doc.embedFont(fonts.Courier);
    courierBold = await doc.embedFont(fonts.CourierBold);

    timesRoman = await doc.embedFont(fonts.TimesRoman);
    timesRomanBold = await doc.embedFont(fonts.TimesRomanBold);

    helvetica = await doc.embedFont(fonts.Helvetica);
    helveticaBold = await doc.embedFont(fonts.HelveticaBold);

    return { courier, courierBold, timesRoman, timesRomanBold, helvetica, helveticaBold };
}

let loadFileBytes = async (filePath) => {
    let bytes = null;
    try {
        bytes = await fs.promises.readFile(filePath);

        console.log(`--- ${filePath} loaded, ${bytes.length} bytes`)
    }
    catch (err) {
        console.trace(err);
    }
    return bytes;
}

let GetFontFromString = (fontName) => {
    switch (fontName) {
        case 'Courier':
            return courier;
        case 'Courier-Bold':
            return courierBold;
        case 'Times-Roman':
            return timesRoman;
        case 'Times-Bold':
            return timesRomanBold;
        case 'Helvetica':
            return helvetica;
        case 'Helvetica-Bold':
            return helveticaBold;
        default:
            return timesRoman;
    }
}

let GetRGBObjectFromObject = (ob) => {
    if( !ob ) return pdf.rgb(1.0, 1.0, 1.0);
    try {
        let { red, green, blue } = ob;

        return pdf.rgb(red, green, blue);
    }
    catch (err) {
        console.trace(err);
    }
}

let lastFontUsed = null;
let textFieldCount = 0;

let addFieldWithText = async (page, form, textData) => {
    let { x, y, fontSize, font, key, width, backgroundColor, alignment, height, isMultiline } = textData;

    font = GetFontFromString(font);
    backgroundColor = GetRGBObjectFromObject(backgroundColor);

    if( !key ) key = `$TEXT_FIELD_${++textFieldCount}`;
    if( !alignment ) alignment = pdf.TextAlignment.Left;
    if( !width ) width = 50;
    if( !height ) height = 6;
    if( !fontSize ) fontSize = 8;

    let textField = null;
    
    try {
        textFieldCount++;

        textField = form.createTextField(key + textFieldCount.toString());

        textField.setText(textData.text || textData.exampleText || '');
    }
    catch (err) {
        console.trace(err);
        
        return 0;
    }

    if( isMultiline ) textField.enableMultiline();

    textField.enableReadOnly();

    textField.addToPage(page, { x, y, font, 
        textColor: pdf.rgb(0.0, 0.0, 0.0),
        borderColor: pdf.rgb(0.0, 0.0, 0.0),
        backgroundColor,
        borderWidth: 0,
        width: width,
        height: height,
    });

    textField.setAlignment(alignment);
    textField.setFontSize(fontSize);
    textField.updateAppearances(font);
}

let addText = async (page, textData) => {
    let { x, y, fontSize, text, font } = textData;
    
    font = GetFontFromString(font);

    if( font &&  font != lastFontUsed ) {
        page.setFont(font);
        lastFontUsed = font;
    }

    if( page.fontSize != fontSize ) {
        page.setFontSize(fontSize);
    }

    if( !text || text == '') text = textData.exampleText;

    page.drawText(text, { x, y });
};


const localeFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const GetValueFromKey = (data, key, formatFunc = null, el) => {
    let keys = key.split('.');
    let val = null;

    let totalKeys = keys.length;

    switch(totalKeys) {
        case 1: val = data[keys[0]];
        break;
        case 2: val = data[keys[0]][keys[1]];
        break;
        case 3: val = data[keys[0]][keys[1]][keys[2]];
        break;
        default: val = null;
    }

    if( val === undefined && data != checkData) return GetValueFromKey(checkData, key, formatFunc, el);

    switch(key) {
        case 'company.City': val = (val + ', ' + data?.company?.State + '   ' + data?.company?.ZipCode); break;
        case 'federalTax.Allowances': 
            val = data.federalTax.DependentAllowance ? Number(data.federalTax.DependentAllowance).toFixed(2) : val?.toString();
            break;
        case 'stateTax.Allowances': 
            val = data.stateTax.DependentAllowance ? Number(data.stateTax.DependentAllowance).toFixed(2) : val?.toString(); 
            break;
        case 'payrollTxns': val = data.payrollTxns || [];
        break;        
        case 'SSN': val = 'xxx-xxxx-' + String(data.SSN || "xxx-xxx-xxxx").toString().substring(5, 9);
        break;
        default: {
            if( val === undefined ) return null;
            if( val === null ) return null;        

            if( el?.cast ) {                
                if( el.cast == "date" ) {                    
                    val = SQLDateUS(new Date(val));
                }
                else if( el.cast == "dateFullYear" ) {
                    val = SQLDateFullYear(new Date(val));
                }
                else if( el.cast == "float" ) {
                    val = Number(val).toFixed(2);
                }
                else if( el.cast == "number" ) {
                    val = Number(val);
                }
                else if( el.cast == "money" ) {
                    val = Number(val).toFixed(2);

                    if( isNaN(val) ) val = '';
                    val = localeFormatter.format(val);
                }
            }
            else val = val.toString().trim(); 
            break;
        }
    }             
    return formatFunc ? formatFunc(val) : val;    
};


const hydrateTemplateFromObject = (dataTemplate, ob, index) => {
    if( !dataTemplate ) return [];

    for(let el of dataTemplate) {                
        if( el.type === '$text' ) {
            el.text = GetValueFromKey(ob, el.dataKey);
            el.y = el.y - (index * 11);
        }
        else if( el.type === '$textField' ) {
            el.text = GetValueFromKey(ob, el.dataKey);
            el.y = el.y - (index * 11)
        }
    }

    return dataTemplate;
};

const parseTemplateElements = (doc, page, form, template, sourceObject) => {
    return new Promise(async (resolve, reject) => {
        for( let i = 0; i < template.length; i++ ) {
            let el = template[i];

            if( el.type === '$text' ) {
                if( !el.header ) {
                    el.text = GetValueFromKey(sourceObject, el.dataKey, null, el);

                    console.log('--- $text added from: ', el.text + ' for template element ' + el.key + el.dataKey);
                }

                addText(page, el);              
            }
            else if( el.type === '$image' ) {
                let { x, y, width, height, opacity } = el;

                if( !pngImageMap[el.source] ) {
                    console.log('--- $image not found: ', el.source);
                    continue;
                }
                page.drawImage(pngImageMap[el.source], { x, y, width, height, opacity });

                console.log('--- $image added: ', el.source);
            }
            else if( el.type === '$textField' ) {
                if( !el.header ) {     
                    el.text = GetValueFromKey(sourceObject, el.dataKey, null, el);

                    console.log('--- $textField added for: ', el.text + ' for template element ' + el.key + el.dataKey);
                }
                addFieldWithText(page, form, el);                
            }
        }

        resolve(true);
    });
};

const parseElements = (doc, page, form, elements) => {
    return new Promise(async (resolve, reject) => {
        for( let i = 0; i < elements.length; i++ ) {
            let el = elements[i];

            if( el.type === '$text' ) {
                if( !el.header ) {
                    el.text = GetValueFromKey(checkData, el.dataKey, null, el);

                    console.log('--- $text added from: ', el.text + ' for element ' + el.dataKey);
                }
                addText(page, el);              
            }
            else if( el.type === '$image' ) {
                let { x, y, width, height, opacity } = el;

                page.drawImage(pngImageMap[el.source], { x, y, width, height, opacity });

                console.log('--- $image added: ', el.source);
            }
            else if( el.type === '$textField' ) {
                if( !el.header ) {
                    console.log(el.dataKey);

                    el.text = GetValueFromKey(checkData, el.dataKey, null, el);

                    console.log('--- $textField added for: ', el.text + ' for element ' + el.dataKey);
                }
                addFieldWithText(page, form, el);                
            }
            else if( el.type === '$objectArray' ) {

                let data = checkData[el.dataKey]

                if( data?.length > 0 ) {

                    console.log(`--- $objectArray: ${el.dataKey} has ${data.length} elements to parse`);

                    for(let i = 0; i < data.length; i++ ) {
                        console.log('--- parsing element: ', i);

                        let dataTemplate = structuredClone(el.dataTemplate);

                        if( !dataTemplate ) throw 'No dataTemplate defined for $objectArray' + el.dataKey;

                        hydrateTemplateFromObject(dataTemplate, data[i], i);

                        //if( el.dataKey == 'totalAccrued') console.log(dataTemplate);

                        console.log('--- parsing dataTemplate: ', dataTemplate.length);

                        parseTemplateElements(doc, page, form, dataTemplate, data[i]);                        
                    }
                }   
                else {
                    console.log(`--- $objectArray: ${el.dataKey || el.key} has no data to parse`);
                }
            }
            else if( el.type === '$line' ) {
                    
                page.drawLine({
                    start: { x: el.start.x, y: el.start.y },
                    end: { x: el.end.x, y: el.end.y },
                    thickness: el.thickness,
                    color: GetRGBObjectFromObject(el.color)
                });
                
                console.log('--- $line was added');
            }
            else {
                console.log('-*- unknown element type: ', el.type);

                // reject(false);
            }
        }

        console.log('--- done ---');

        resolve(true);
    })
}

const createPDFFromJson = async (json) => {
    let doc, templateDoc, form;

    let templatePdf  = json.pdfTemplateFile.filePath;

    if( !templatePdf ) {
        return console.log('No template PDF file specified in json file');
    }

    let templatePdfBytes = await loadFileBytes(templatePdf);

    if( !templatePdfBytes ) {
        return console.log('Could not load template PDF file: ', templatePdf);
    }

    try {
        templateDoc = await pdf.PDFDocument.load(templatePdfBytes, { updateMetadata: true });
    }
    catch (err) {
        console.log('Error pdf.PDFDocument.load: loading PDF file: ', templatePdf);

        return console.trace(err);
    }


    try {
        let numPages = templateDoc.getPageCount();

        console.log(`--- template pdf opened and copied: ${numPages} pages ---`);

        doc = await pdf.PDFDocument.create();

        let pngs = json.pngImageArray;

        if( pngs ) {

            for( let i = 0; i < pngs.length; i++ ) {
                let png = pngs[i];

                let pngBytes = await loadFileBytes(png.filePath);

                if( pngBytes ) {
                    pngImageMap[png.filePath] = await doc.embedPng(pngBytes);

                    console.log(`--- embedded PNG: ${png.filePath} ---`);
                }
            }

        }

        let metadata = json.pdfMetadata;

        if( metadata ) {
            if( metadata.title ) doc.setTitle(metadata.title);
            if( metadata.author ) doc.setAuthor(metadata.author);
            if( metadata.subject ) doc.setSubject(metadata.subject);
            if( metadata.keywords ) doc.setKeywords(metadata.keywords);
            if( metadata.creator ) doc.setCreator(metadata.creator);
            if( metadata.producer ) doc.setProducer(metadata.producer);

            console.log('--- metadata set ---');
        }

        let [page] = await doc.copyPages(templateDoc, [0]);

        doc.addPage(page);

        form = doc.getForm();

        await embedFonts(doc);

        page.setFont(timesRoman, { size: 7 });

        let fin = await parseElements(doc, page, form, json.elementsArray);

        //console.log(fin)
    }
    catch (err) {
        console.log('--- Error creating new PDF document: ', err);
        
        return console.trace(err);
    }

 
    let pdfBytes = await doc.save();

    let fileName = __OUTPUT_PDF_FILE__.replace('#', checkData.CheckNumber);

    try {    
        await fs.promises.writeFile(fileName, pdfBytes);

        console.log(`--- PDF output written: ${fileName} - size: ${pdfBytes.length} bytes`);

        return fileName;
    }
    catch (err) {
        console.log('--- Error writing PDF file: ', err);

        return console.trace(err);
    }
}

const loadJsonMappingsFile = async (path = './partners-tri-fold-paystub-mappings.json') => {
    const data = await fs.promises.readFile(path, 'ascii');

    try {
        console.log('--- Json rcp.pdf.builder file loaded: ', path);
        return JSON.parse(data);

    } catch (error) {       

        throw new Error('Invalid Json file: ', path, error);

    }
}

const { ToWords } = require('to-words');

const generatePDFByCheckNumber = async (options) => {

    await connectMSSQL();
    
    console.log('--- Looking up paycheck data for checkNumber: ', options.checkNumber);

    if( options.checkNumber ) {
        let q;
        
        if( !options.AIdent ) q = await getPrCheckRootData(options.checkNumber);
        else q = await getPrCheckRootDataWithAIdent(options.checkNumber, options.AIdent);

        console.log(q.recordset.length + ' paycheck checkNumber record(s) found');

        if( q.recordset.length < 1 ) return -1;

        checkData = structuredClone(q.recordset[0]);

        if( checkData ) {            
            let res = await getAccruedValueTotalUsedUpToCheckDate(SQLDate(checkData.CheckDate), checkData.AIdent, options.checkNumber);

            if( res?.recordset?.length > 0 ) {
                console.log(res);

                console.log(res?.recordset?.length + ' paycheck Accrue record(s) found for checkNumber');
                checkData.totalAccrued = res.recordset;                          
            }
            else {
                checkData.totalAccrued = { calculatedValue: 0.0, noRecords: true };
                checkData.thisCheckAccrued = [];
            }

            let parts = checkData.AddressBox.split('\r\n');

            if( parts.length ) {
                checkData.CityStateZip = parts.pop();
            }
            else {
                throw new Error('No proper AddressBox found in checkData');
            }

            if( parts.length ) {
                checkData.AddressName = parts[0];
                parts.shift();
            }
            else {
                checkData.AddressName = 'Unknown Name';
            }
            
            let converter = new ToWords({ localeCode: 'en-US' });
            checkData.NetAmountWords = converter.convert(checkData.Net, { currency: true, locale: 'en-US' });

            checkData.NetAmountWords = checkData.NetAmountWords.replace('Dollars', 'DOLLARS');
            checkData.NetAmountWords = checkData.NetAmountWords.replace('Cents', 'CENTS');

            switch(parts.length) {
                case 1: checkData.Address1 = parts[0]; checkData.Address2 = ''; break;
                case 2: checkData.Address1 = parts[0]; checkData.Address2 = parts[1]; break;
                default: checkData.Address1 = ''; checkData.Address2 = ''; break;
            }

            res = await getPrRateAtCheckDate(SQLDateUS(checkData.CheckDate), checkData.AIdent);
            console.log(res?.recordset?.length + ' paycheck rate record(s) found');

            if( res?.recordset?.length ) {
            checkData['AssignmentID'] = res.recordset[0].AssignmentNumber;
            checkData.PayRate = res.recordset[0].PayRate;
            checkData['DTPayRate'] = res.recordset[0].DTPayRate;
            checkData['OTPayRate'] = res.recordset[0].OTPayRate;            
            } else {
                checkData['AssignmentID'] = '';
                checkData.PayRate = '';
                checkData['DTPayRate'] = '';
                checkData['OTPayRate'] = '';
            }


            res = await getYTDTaxesPaid(SQLDate(checkData.CheckDate), checkData.AIdent, checkData.YearID);

            console.log(res?.recordset?.length + ' paycheck associate YTD Tax record(s) aggregated from checkDate');
            if( res?.recordset?.length ) {
                checkData.ytdTaxesPaid = res.recordset;
                checkData.ytdTotalTaxesPaid = res.recordset.reduce((acc, cur) => acc + cur.totalEmployeePaid, 0.0) ?? 0.0;
            }
            else {
                checkData.ytdTaxesPaid = [];
                checkData.ytdTotalTaxesPaid = 0.0;
            }

            res = await getCheckTaxesPaid(checkData.ChkId);

            console.log(res?.recordset?.length + ' paycheck associate Tax record(s) found');
            if( res?.recordset?.length ) {
                checkData.taxesPaid = res.recordset;
                checkData.totalTaxesPaid = res.recordset.reduce((acc, cur) => acc + cur.AmountTax, 0.0);
            }
            else {
                checkData.taxesPaid = [];
                checkData.totalTaxesPaid = 0.0;
            }

            let federalTax = checkData.taxesPaid.find((tax) => tax.W2Label === 'US');
            if( federalTax ) {
                checkData.federalTax = federalTax;
            }
            else checkData.federalTax = 0.0;

            let stateTax = checkData.taxesPaid.find((tax) => tax.W2Label !== 'US' && (tax.CompatibleJuris?.includes('IncTax') || tax.CompatibleJurisDescription?.includes('State Tax')));
            if( stateTax ) {
                checkData.stateTax = stateTax;
            }
            else checkData.stateTax = 0.0;

            res = await getPayrollTxnsData(checkData.ChkId, checkData.AIdent);

            console.log(res?.recordset?.length + ' paycheck/Payroll transaction record(s) found');
            checkData.payrollTxns = res.recordset ?? [];

            res = await getPrChkAdjsYTDForUser(SQLDate(checkData.CheckDate), checkData.AIdent);
            console.log(res?.recordset?.length + ' paycheck adjustment YTD record(s) found');
            if( res?.recordset?.length ) {
                checkData.ytdAdjustments = res.recordset ?? { noRecords: true };
            }
            else {
                checkData.ytdAdjustments = 0.0;
            }

            res = await getPrCheckAdjsForUser(checkData.ChkId, checkData.AIdent);

            console.log(res?.recordset?.length + ' paycheck adjustment record(s) found');
            checkData.adjustments = res.recordset ?? [];

            for( let i = 0; i < checkData.adjustments.length; i++ ) {
                let adjId = checkData.adjustments[i].AdjId;

                let adj = checkData.ytdAdjustments.find((adj) => adj.AdjId == adjId);
                if( adj ) {
                    checkData.adjustments[i].ytdAdjAmount = adj.ytdTotal;
                    if( !checkData.ytdAdjTotal ) checkData.ytdAdjTotal = 0.0;
                    checkData.ytdAdjTotal += adj.ytdTotal;
                }
                else {
                    checkData.adjustments[i].ytdAdjAmount = '';
                }
            }

            res = await getYTDSumsForUser(SQLDate(checkData.CheckDate), checkData.AIdent, checkData.YearID);
            console.log(res?.recordset?.length + ' paycheck YTD sums record(s) found');
            if( res?.recordset?.length ) {
                checkData.ytdGrossSum = res.recordset[0].ytdGross;
                checkData.ytdNetSum = res.recordset[0].ytdNet;
            }
            else {
                checkData.ytdGrossSum = 0.0;
                checkData.ytdNetSum = 0.0;
            }
            
            res = await getCompanyRootData(checkData.EINC);

            console.log(res?.recordset?.length + ' company record(s) found');
            if( res?.recordset?.length ) checkData.company = res.recordset[0];
            else {
                console.log('--- no company record found for EINC: ', checkData.EINC);

                checkData.company = { EINC: -1, noRecords: true };
            }

        }

        //console.log(checkData);
    }

    let json = await loadJsonMappingsFile();

    let pdfFileName = await createPDFFromJson(json);

    sql.close().then(() => {
        console.log('--- MSSQL Connection Closed ---');
    });
 
    return pdfFileName;
}


module.exports = {
    generatePDFByCheckNumber,
}
