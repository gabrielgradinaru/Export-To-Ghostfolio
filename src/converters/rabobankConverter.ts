import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { RabobankRecord } from "../models/rabobankRecord";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class RabobankConverter extends AbstractConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);

        dayjs.extend(customParseFormat);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: ";",
            fromLine: 2,
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert actions to Ghostfolio type.
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("koop") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("verkoop") > -1) {
                        return "sell";
                    }
                    else if (action.indexOf("dividend") > -1) {
                        return "dividend";
                    }
                    else if (action.indexOf("rente") > -1) {
                        return "interest";
                    }
                    else if (action.indexOf("tarieven") > -1) {
                        return "fee";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "amount" || 
                    context.column === "price") {

                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (_, records: RabobankRecord[]) => {

            // If records is empty, parsing failed..
            if (records === undefined || records.length === 0) {                    
                return errorCallback(new Error("An error ocurred while parsing!"));
            }

            console.log("[i] Read CSV file. Start processing..");
            const result: GhostfolioExport = {
                meta: {
                    date: new Date(),
                    version: "v0"
                },
                activities: []
            }

            // Populate the progress bar.
            const bar1 = this.progress.create(records.length, 0);

            for (let idx = 0; idx < records.length; idx++) {
                const record = records[idx];

                // Check if the record should be ignored.
                if (this.isIgnoredRecord(record)) {
                    bar1.increment();
                    continue;
                }

                // Interest does not have a security, so add those immediately.
                if (record.type.toLocaleLowerCase() === "interest" ||
                    record.type.toLocaleLowerCase() === "fee") {

                    const feeAmount = Math.abs(record.totalAmount);

                    // Add fees record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: feeAmount,
                        quantity: 1,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: feeAmount,
                        currency: "USD", 
                        dataSource: "MANUAL",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: ""
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        record.isin,
                        null,
                        record.name,
                        record.currency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.isin, idx + 2);        
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.type} action for ${record.isin}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: 0,
                    quantity: record.amount,
                    type: GhostfolioOrderType[record.type],
                    unitPrice: record.price,
                    currency: record.currency,
                    dataSource: "YAHOO",
                    date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                    symbol: security.symbol
                });

                bar1.increment();
            }

            this.progress.stop()

            successCallback(result);
        });
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: RabobankRecord): boolean {
        let ignoredRecordTypes = ["storting", "opname"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
