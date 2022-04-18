const express = require('express')
const app = express()
const multer = require('multer')
const config = require("./dbconfig");
const sql = require("mssql")
const readXlsxFile = require('read-excel-file/node');
const excelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const morgan = require('morgan');
require('dotenv').config();
app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')))
app.use(morgan('dev'));

// Multer Upload Storage
// อัพโหลดไฟล์
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, __dirname + '/uploads/')
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "-" + Date.now() + "-" + file.originalname)
    }
});
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    res.render('index')
})

// อัพ excel
app.route("/uploadExcel").get((req, res) => {
    res.render('uploadExcel')
}).post(upload.single("uploadfile"), async (req, res) => {

    try {
        let pool = await sql.connect(config);

        let countRowsAffected = 0;
        let insertSuccess = []
        let insertFail = []

        // อ่าน excel
        const rows = await readXlsxFile(__dirname + '/uploads/' + req.file.filename)

        console.log(rows.length)
        rows.shift();

        // func insert data to mssql
        const insertRow = row => {
            return new Promise((resolve, reject) => {
                pool.request().input('input_COUNTRY', sql.NVarChar(255), row[0])
                    .input('input_CITY', sql.NVarChar(255), row[1])
                    .input('input_YEAR', sql.Int, row[2])
                    .input('input_PM25', sql.Float, row[3])
                    .input('input_LATITUDE', sql.Float, row[4])
                    .input('input_LONGTIUDE', sql.Float, row[5])
                    .input('input_POPULATION', sql.Int, row[6])
                    .input('input_WBINC16', sql.NVarChar(255), row[7])
                    .input('input_REGION', sql.NVarChar(255), row[8])
                    .input('input_CONC_PM25', sql.NVarChar(255), row[9])
                    .input('input_COLOR_PM25', sql.NVarChar(255), row[10])
                    .query(`INSERT INTO [${process.env.DBTABLE}] (COUNTRY, CITY, YEAR, PM25, LATITUDE, LONGTIUDE, POPULATION, WBINC16, REGION, CONC_PM25, COLOR_PM25)
                                    VALUES (@input_COUNTRY, @input_CITY,
                                        @input_YEAR, @input_PM25,
                                        @input_LATITUDE,
                                        @input_LONGTIUDE,
                                        @input_POPULATION,
                                        @input_WBINC16,
                                        @input_REGION,
                                        @input_CONC_PM25,
                                        @input_COLOR_PM25)`
                        , (err, result) => {
                            // เก็บ log insert
                            if (err) {
                                insertFail.push(row)
                            } else {
                                insertSuccess.push(row)
                                countRowsAffected = countRowsAffected + parseInt(result.rowsAffected)
                            }
                            resolve()
                        })
            })
        }

        // insert ค่า โดย loop excel
        for (let row of rows) {
            await insertRow(row)
        }

        // create excel insertLog
        const workbook = new excelJS.Workbook();
        const worksheetInsertSuccess = workbook.addWorksheet(`insertSuccess`);
        worksheetInsertSuccess.columns = [
            { header: "COUNTRY", key: "COUNTRY", width: 20 },
            { header: "CITY", key: "CITY", width: 20 },
            { header: "YEAR", key: "YEAR", width: 20 },
            { header: "PM25", key: "PM25", width: 20 },
            { header: "LATITUDE", key: "LATITUDE", width: 20 },
            { header: "LONGTIUDE", key: "LONGTIUDE", width: 20 },
            { header: "POPULATION", key: "POPULATION", width: 20 },
            { header: "WBINC16", key: "WBINC16", width: 20 },
            { header: "REGION", key: "REGION", width: 20 },
            { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
            { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
        ];

        insertSuccess.forEach(e => {
            worksheetInsertSuccess.addRow(e)
        })
        worksheetInsertSuccess.getRow(1).eachCell((cell) => {
            cell.font = { bold: true };
        });

        const worksheetInsertFail = workbook.addWorksheet(`insertFail`);
        worksheetInsertFail.columns = [
            { header: "COUNTRY", key: "COUNTRY", width: 20 },
            { header: "CITY", key: "CITY", width: 20 },
            { header: "YEAR", key: "YEAR", width: 20 },
            { header: "PM25", key: "PM25", width: 20 },
            { header: "LATITUDE", key: "LATITUDE", width: 20 },
            { header: "LONGTIUDE", key: "LONGTIUDE", width: 20 },
            { header: "POPULATION", key: "POPULATION", width: 20 },
            { header: "WBINC16", key: "WBINC16", width: 20 },
            { header: "REGION", key: "REGION", width: 20 },
            { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
            { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
        ];

        insertFail.forEach(e => {
            worksheetInsertFail.addRow(e)
        })
        worksheetInsertFail.getRow(1).eachCell((cell) => {
            cell.font = { bold: true };
        });


        const fileName = `insertLog.xlsx`
        const filePath = path.join(__dirname, `public/excel/${fileName}`)
        const data = await workbook.xlsx.writeFile(filePath)
        fs.exists(filePath, function (exists) {
            if (exists) {
                res.download(filePath, fileName);
            }
        });


        // res.json({ "totalInsert": insertSuccess.length + insertFail.length, "RowsAffected": insertSuccess.length, "insertSuccess": insertSuccess, "insertFail": insertFail })

    } catch (error) {
        console.log(error)
        res.json({ "success": false, "message": error })
    }

})



// Perform the following queries and save the results in excel files:
app.route('/query').get((req, res) => {
    res.render('queryPage');
})


app.post('/query/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const id = req.params.id;
        if (id == 1) {
            // a) List country and city names whose PM 2.5 values are greater than 50 in 2015.
            let pool = await sql.connect(config);

            // query
            const result = await pool.request().query(`SELECT COUNTRY, CITY FROM [${process.env.DBTABLE}] WHERE PM25 > 50 AND YEAR = 2015;`)

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`PM 2.5 > 50 YEAR 2015`);

            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
            ];
            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });
            const fileName = `List-country-and-city-names-whose-PM-2.5-values-are-greater-than-50-in-2015.xlsx`
            const filePath = path.join(__dirname, `public/excel/query/${fileName}`)
            const data = await workbook.xlsx.writeFile(filePath)

            fs.exists(filePath, function (exists) {
                if (exists) {
                    res.download(filePath, fileName);
                }
            });

        } else if (id == 2) {
            // b) Calculate the AVG(PM 2.5) by country (show the results in a decreasing order).
            let pool = await sql.connect(config);

            // query
            const result = await pool.request().query(`SELECT COUNTRY, AVG(PM25) as 'AVG_PM25' FROM [${process.env.DBTABLE}] GROUP BY COUNTRY ORDER BY AVG_PM25 DESC;`);

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet("AVG(PM 2.5) by country");
            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "AVG_PM25", key: "AVG_PM25", width: 20 },
            ];
            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })

            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });
            const fileName = `Calculate-the-AVG(PM-2.5)-by-country-(show-the-results-in-a-decreasing-order).xlsx`
            const filePath = path.join(__dirname, `public/excel/query/${fileName}`)
            const data = await workbook.xlsx.writeFile(filePath)

            fs.exists(filePath, function (exists) {
                if (exists) {
                    res.download(filePath, fileName);
                }
            });

        } else if (id == 3) {
            // c) Given a <country_input> from the user, show a historical PM 2.5 values by year.
            // get country_input
            const country_input = req.body.country_input;
            let pool = await sql.connect(config);

            // query
            const result = await pool.request()
                .input('country_input', sql.NVarChar(255), country_input)
                .query(`SELECT COUNTRY, CITY, YEAR, PM25 FROM [${process.env.DBTABLE}] WHERE COUNTRY = @country_input ORDER BY YEAR;`);

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`${country_input} historical PM 2.5`);

            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
            ];

            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })

            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });

            const fileName = `Given-a-country_input-from-the-user,-show-a-historical-PM-2.5-values-by-year.xlsx`
            const filePath = path.join(__dirname, `public/excel/query/${fileName}`)
            const data = await workbook.xlsx.writeFile(filePath)

            fs.exists(filePath, function (exists) {
                if (exists) {
                    res.download(filePath, fileName);
                }
            });
        } else if (id == 4) {
            // c) Given a <country_input> from the user, show a historical PM 2.5 values by year.
            // get color_pm25, get  year_input
            const color_pm25 = req.body.color_pm25
            const year_input = parseInt(req.body.year_input)
            let pool = await sql.connect(config);

             // query
            const result = await pool.request()
                .input('color_pm25', sql.NVarChar(255), color_pm25)
                .input('year_input', sql.Int, year_input)
                .query(`SELECT SUM(POPULATION) as 'TOTAL-OF-THE-AFFECTED-POPULATION' FROM [${process.env.DBTABLE}] WHERE YEAR = @year_input AND COLOR_PM25 = @color_pm25;`);

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`${color_pm25} ${year_input} total affected `);

            worksheet.columns = [
                { header: "TOTAL-OF-THE-AFFECTED-POPULATION", key: "TOTAL-OF-THE-AFFECTED-POPULATION", width: 50 },
            ];

            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });
            const fileName = `Given-a-year_input-and-an-input-of-color_pm25-level-of-health-concern-from-the-user,-calculate-a-total-of-the-affected-population-(in-number).xlsx`
            const filePath = path.join(__dirname, `public/excel/query/${fileName}`)
            const data = await workbook.xlsx.writeFile(filePath)

            fs.exists(filePath, function (exists) {
                if (exists) {
                    res.download(filePath, fileName);
                }
            });

        }

    } catch (error) {
        console.log(error)
        res.json({ "success": false, "message": error })
    }
})


// 5) Perform the following queries and visualize the map results on the Web:
app.get('/visualizeMap', (req, res) => {
    res.render('visualizeMap')
})


app.post('/visualizeMap/:id', async (req, res) => {

    try {
        const id = req.params.id;
        if (id == 1) {
            // a) Given a <year_input> from the user, visualize all the city points of all countries.
            // get year_input
            const year_input = req.body.year_input
            let pool = await sql.connect(config);
            // query
            const result = await pool.request()
                .input('year_input', sql.Int, year_input)
                .query(`SELECT * FROM [${process.env.DBTABLE}] WHERE YEAR = @year_input`)

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`${year_input} all city `);
            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
                { header: "latitude", key: "LATITUDE", width: 20 },
                { header: "longitude", key: "LONGTIUDE", width: 20 },
                { header: "POPULATION", key: "POPULATION", width: 20 },
                { header: "WBINC16", key: "WBINC16", width: 20 },
                { header: "REGION", key: "REGION", width: 20 },
                { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
                { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
                { header: "GEOM", key: "GEOM", width: 20 },
            ];
            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });
            const fileNameXlsx = `Given-a-year_input-from-the-user,-visualize-all-the-city-points-of-all-countries.xlsx`
            const fileNameCsv = `Given-a-year_input-from-the-user,-visualize-all-the-city-points-of-all-countries.csv`
            const filePathXlsx = path.join(__dirname, `public/excel/visualize/${fileNameXlsx}`)
            const filePathCsv = path.join(__dirname, `public/csv/${fileNameCsv}`)
            const data = await workbook.xlsx.writeFile(filePathXlsx)
            const workBookXlsx = XLSX.readFile(filePathXlsx);

             // create csv
            await XLSX.writeFile(workBookXlsx, filePathCsv, { bookType: "csv" });
            fs.exists(filePathCsv, function (exists) {
                if (exists) {
                    res.status(200).render("map", { "mapCsv": fileNameCsv, "whatQuery": `Given a ${year_input} from the user, visualize all the city points of all countries.` })
                }
            });

        } else if (id == 2) {
            // b) Visualize the 50 closest city points to Bangkok.
            let pool = await sql.connect(config);
            // query
            const result = await pool.request().query(
                `DECLARE @BangkokPoint GEOMETRY;
                SELECT @BangkokPoint = GEOM
                FROM [${process.env.DBTABLE}]
                WHERE CITY = 'Bangkok';

                SELECT TOP 50 sub.COUNTRY, sub.CITY, sub.YEAR, sub.PM25, sub.LATITUDE, sub.LONGTIUDE, sub.POPULATION, sub.WBINC16, sub.REGION, sub.CONC_PM25, sub.COLOR_PM25, sub.GEOM,sub.Geom.MakeValid().STDistance(@BangkokPoint) AS Distance
                FROM (
                    SELECT [COUNTRY]
                        ,[CITY]
                        ,[YEAR]
                        ,[PM25]
                        ,[LATITUDE]
                        ,[LONGTIUDE]
                        ,[POPULATION]
                        ,[WBINC16]
                        ,[REGION]
                        ,[CONC_PM25]
                        ,[COLOR_PM25]
                        ,[GEOM],
                        ROW_NUMBER() OVER (PARTITION BY CITY ORDER BY YEAR) AS RowNumber
                    FROM [${process.env.DBTABLE}]
                    ) AS sub
                WHERE  sub.RowNumber = 1 AND sub.CITY <> 'Bangkok'
                ORDER BY Distance ASC;`
            )

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`50 closest Bangkok`);

            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
                { header: "latitude", key: "LATITUDE", width: 20 },
                { header: "longitude", key: "LONGTIUDE", width: 20 },
                { header: "POPULATION", key: "POPULATION", width: 20 },
                { header: "WBINC16", key: "WBINC16", width: 20 },
                { header: "REGION", key: "REGION", width: 20 },
                { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
                { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
                { header: "GEOM", key: "GEOM", width: 20 },
            ];
            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });

            const fileNameXlsx = `Visualize-the-50-closest-city-points-to-Bangkok.xlsx`
            const fileNameCsv = `Visualize-the-50-closest-city-points-to-Bangkok.csv`
            const filePathXlsx = path.join(__dirname, `public/excel/visualize/${fileNameXlsx}`)
            const filePathCsv = path.join(__dirname, `public/csv/${fileNameCsv}`)

            const data = await workbook.xlsx.writeFile(filePathXlsx)
            const workBookXlsx = XLSX.readFile(filePathXlsx);
            // create csv
            await XLSX.writeFile(workBookXlsx, filePathCsv, { bookType: "csv" });
            fs.exists(filePathCsv, function (exists) {
                if (exists) {
                    res.status(200).render("map", { "mapCsv": fileNameCsv, "whatQuery": `Visualize the 50 closest city points to Bangkok.` })
                }
            });

        } else if (id == 3) {

            // c) Visualize all the city points of Thailand’s neighboring countries in 2018.
            let pool = await sql.connect(config);

            //get year_input
            const year_input = req.body.year_input

            // query
            const result = await pool.request()
                .input('year', sql.Int, year_input)
                .query(
                    `DECLARE @Thailand GEOMETRY;
                SELECT @Thailand = Geom
                FROM world
                WHERE name = 'Thailand';

                SELECT *
                FROM [${process.env.DBTABLE}]
                WHERE year = @year AND COUNTRY in (SELECT NAME
                                                FROM world
                                                WHERE Geom.MakeValid().STTouches(@Thailand.MakeValid()) = 1)`
                )

            //create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`Thailand’s neighboring countries ${year_input}`);

            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
                { header: "latitude", key: "LATITUDE", width: 20 },
                { header: "longitude", key: "LONGTIUDE", width: 20 },
                { header: "POPULATION", key: "POPULATION", width: 20 },
                { header: "WBINC16", key: "WBINC16", width: 20 },
                { header: "REGION", key: "REGION", width: 20 },
                { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
                { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
                { header: "GEOM", key: "GEOM", width: 20 },
            ];
            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });

            const fileNameXlsx = `Visualize-all-the-city-points-of-Thailand’s-neighboring-countries-in-${year_input}.xlsx`
            const fileNameCsv = `Visualize-all-the-city-points-of-Thailand’s-neighboring-countries-in-${year_input}.csv`
            const filePathXlsx = path.join(__dirname, `public/excel/visualize/${fileNameXlsx}`)
            const filePathCsv = path.join(__dirname, `public/csv/${fileNameCsv}`)

            const data = await workbook.xlsx.writeFile(filePathXlsx)
            const workBookXlsx = XLSX.readFile(filePathXlsx);
            // create csv
            await XLSX.writeFile(workBookXlsx, filePathCsv, { bookType: "csv" });
            fs.exists(filePathCsv, function (exists) {
                if (exists) {
                    res.status(200).render("map", { "mapCsv": fileNameCsv, "whatQuery": `Visualize all the city points of Thailand’s neighboring countries in ${year_input}` })
                }
            });

        } else if (id == 4) {

            // d) Visualize the four points of MBR covering all city points in Thailand in 2009.
            let pool = await sql.connect(config);
            const country = 'Thailand';
            // get year_input
            const year_input = req.body.year_input

            // query MBR
            const result_MBR = await pool.request()
                .input('country', sql.NVarChar(255), country)
                .input('year', sql.Int, year_input)
                .query(
                    `DECLARE @TH geometry
                SELECT @TH = geometry::UnionAggregate(GEOM)
                FROM [${process.env.DBTABLE}]
                WHERE COUNTRY = @country AND YEAR = @year;

                SELECT @TH.STEnvelope().ToString()  as envelope;
                `)

            // ตัดให้เหลือ 4 จุด
            const tem = result_MBR.recordset[0]['envelope'].replace("POLYGON ((", "").replace("))", "").split(", ")

            // กำหนดให้แต่ละจุด
            const fourPointsoFMBR = {
                'bottom-left': [parseFloat(tem[0].split(" ")[0]), parseFloat(tem[0].split(" ")[1])],
                'bottom-right': [parseFloat(tem[1].split(" ")[0]), parseFloat(tem[1].split(" ")[1])],
                'top-right': [parseFloat(tem[2].split(" ")[0]), parseFloat(tem[2].split(" ")[1])],
                'top-left': [parseFloat(tem[3].split(" ")[0]), parseFloat(tem[3].split(" ")[1])],
            }
            console.log(fourPointsoFMBR)

            // query all city points in Thailand in 2009.
            const result = await pool.request()
                .input('country', sql.NVarChar(255), country)
                .input('year', sql.Int, year_input)
                .query(`SELECT * FROM [${process.env.DBTABLE}] WHERE COUNTRY =  @country AND YEAR = @year;`)

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`highest no of city in ${year_input}`);
            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
                { header: "latitude", key: "LATITUDE", width: 20 },
                { header: "longitude", key: "LONGTIUDE", width: 20 },
                { header: "POPULATION", key: "POPULATION", width: 20 },
                { header: "WBINC16", key: "WBINC16", width: 20 },
                { header: "REGION", key: "REGION", width: 20 },
                { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
                { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
                { header: "GEOM", key: "GEOM", width: 20 },
            ];

            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });
            const fileNameXlsx = `Visualize-the-four-points-of-MBR-covering-all-city-points-in-Thailand-in-${year_input}.xlsx`
            const fileNameCsv = `Visualize-the-four-points-of-MBR-covering-all-city-points-in-Thailand-in-${year_input}.csv`
            const filePathXlsx = path.join(__dirname, `public/excel/visualize/${fileNameXlsx}`)
            const filePathCsv = path.join(__dirname, `public/csv/${fileNameCsv}`)

            const data = await workbook.xlsx.writeFile(filePathXlsx)
            const workBookXlsx = XLSX.readFile(filePathXlsx);

            // create csv
            await XLSX.writeFile(workBookXlsx, filePathCsv, { bookType: "csv" });

            res.render("map_2", { "mapCsv": fileNameCsv, fourPointsoFMBR, "whatQuery": `Visualize the four points of MBR covering all city points in Thailand in ${year_input}.` })


        } else if (id == 5) {
            // e) Visualize all city points of countries having the highest no. of city points in 2011.
            let pool = await sql.connect(config);

            // query
            const result = await pool.request().query(
                `select *
                from dbo.AirPollutionPM25
                where  YEAR = 2011 AND COUNTRY = (
                    select top 1 COUNTRY
                    from dbo.AirPollutionPM25
                    WHERE YEAR = 2011
                    GROUP BY COUNTRY
                    order by count(city) desc);`
            )
            // create exp
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`highest no of city in 2011`);
            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
                { header: "latitude", key: "LATITUDE", width: 20 },
                { header: "longitude", key: "LONGTIUDE", width: 20 },
                { header: "POPULATION", key: "POPULATION", width: 20 },
                { header: "WBINC16", key: "WBINC16", width: 20 },
                { header: "REGION", key: "REGION", width: 20 },
                { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
                { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
                { header: "GEOM", key: "GEOM", width: 20 },
            ];

            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });
            const fileNameXlsx = `Visualize-all-city-points-of-countries-having-the-highest-no.-of-city-points-in-2011.xlsx`
            const fileNameCsv = `Visualize-all-city-points-of-countries-having-the-highest-no.-of-city-points-in-2011.csv`
            const filePathXlsx = path.join(__dirname, `public/excel/visualize/${fileNameXlsx}`)
            const filePathCsv = path.join(__dirname, `public/csv/${fileNameCsv}`)

            const data = await workbook.xlsx.writeFile(filePathXlsx)
            const workBookXlsx = XLSX.readFile(filePathXlsx);
            // create csv
            await XLSX.writeFile(workBookXlsx, filePathCsv, { bookType: "csv" });
            fs.exists(filePathCsv, function (exists) {
                if (exists) {
                    res.status(200).render("map", { "mapCsv": fileNameCsv, "whatQuery": `Visualize all city points of countries having the highest no. of city points in 2011.` })
                }
            });



        } else if (id == 6) {
            // f) Given a <year_input> from the user, visualize all the city points which are considered as “low income” (as specified in column wbinc16_text).
            // get year_input
            const year_input = req.body.year_input
            let pool = await sql.connect(config);

            // query
            const result = await pool.request()
                .input('year_input', sql.Int, year_input)
                .query(`SELECT * FROM [${process.env.DBTABLE}] WHERE YEAR=@year_input AND WBINC16 = 'low income'`)

            // create excel
            const workbook = new excelJS.Workbook();
            const worksheet = workbook.addWorksheet(`${year_input} all city `);

            worksheet.columns = [
                { header: "COUNTRY", key: "COUNTRY", width: 20 },
                { header: "CITY", key: "CITY", width: 20 },
                { header: "YEAR", key: "YEAR", width: 20 },
                { header: "PM25", key: "PM25", width: 20 },
                { header: "latitude", key: "LATITUDE", width: 20 },
                { header: "longitude", key: "LONGTIUDE", width: 20 },
                { header: "POPULATION", key: "POPULATION", width: 20 },
                { header: "WBINC16", key: "WBINC16", width: 20 },
                { header: "REGION", key: "REGION", width: 20 },
                { header: "CONC_PM25", key: "CONC_PM25", width: 20 },
                { header: "COLOR_PM25", key: "COLOR_PM25", width: 20 },
                { header: "GEOM", key: "GEOM", width: 20 },
            ];
            result.recordset.forEach(e => {
                worksheet.addRow(e)
            })
            worksheet.getRow(1).eachCell((cell) => {
                cell.font = { bold: true };
            });

            const fileNameXlsx = `Given-a-year_input-from-the-user,-visualize-all-the-city-points-of-all-countries.xlsx`
            const fileNameCsv = `Given-a-year_input-from-the-user,-visualize-all-the-city-points-of-all-countries.csv`
            const filePathXlsx = path.join(__dirname, `public/excel/visualize/${fileNameXlsx}`)
            const filePathCsv = path.join(__dirname, `public/csv/${fileNameCsv}`)

            const data = await workbook.xlsx.writeFile(filePathXlsx)
            const workBookXlsx = XLSX.readFile(filePathXlsx);
            // create csv
            await XLSX.writeFile(workBookXlsx, filePathCsv, { bookType: "csv" });
            fs.exists(filePathCsv, function (exists) {
                if (exists) {
                    res.status(200).render("map", { "mapCsv": fileNameCsv, "whatQuery": `Given a ${year_input} from the user, visualize all the city points which are` })
                }
            });

        }

    } catch (error) {
        console.log(error.message)
        res.json({ "success": false, "message": error.message })
    }

})

// start server on port
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
})