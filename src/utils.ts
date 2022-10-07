import { log, RequestList } from 'crawlee';
import type { RequestOptions, RequestQueue } from 'crawlee';

import { COUNTRY_DICT, LABELS } from './constants.js';

export const makeUrlFull = (href: string, urlParsed: URL) => {
    if (href.slice(0, 1) === '/') return urlParsed.origin + href;
    return href;
};

export const getIdFromUrl = (url: string) => {
    return url.match(new RegExp('(?<=jk=).*?$'))
        ? url.match(new RegExp('(?<=jk=).*?$'))![0]
        : '';
};

export const fromStartUrls = async function* (startUrls: RequestOptions[], name = 'STARTURLS'): AsyncGenerator<RequestOptions> {
    const rl = await RequestList.open(name, startUrls);
    /** @type {Apify.Request | null} */
    let rq;
    // eslint-disable-next-line no-cond-assign
    while ((rq = await rl.fetchNextRequest())) {
        yield rq;
    }
};

export const checkMaxItemsInput = (maxItems: number | undefined) => {
    if (maxItems === undefined) {
        log.info(`no maxItems value. Set it to 990 (max)`);
        maxItems = 990;
    }
    if (maxItems > 990) {
        log.warning(
            `The limit of items you set exceeds maximum allowed value. Max possible number of offers, that can be processed is 990.`,
        );
        maxItems = 990;
    }

    return maxItems;
};

interface BuildStartUrlsOptions {
    country: string;
    requestQueue: RequestQueue;
    position?: string;
    location?: string;
    startUrls?: RequestOptions[];
}

export const buildStartUrl = async ({ requestQueue, position, location, country, startUrls }: BuildStartUrlsOptions) => {
    // Using startUrls => disables search
    const countryUrl = COUNTRY_DICT[country.toLowerCase()] || `https://${country || 'www'}.indeed.com`;

    if (Array.isArray(startUrls) && startUrls.length > 0) {
        for await (const req of fromStartUrls(startUrls)) {
            // this line changed
            if (!req.url) {
                throw new Error('StartURL in bad format, needs to be object with url field');
            }
            if (!req.userData) {
                req.userData = {};
            }
            if (!req.label) {
                req.label = LABELS.START;
            }
            req.userData.currentPageNumber = 1;
            if (req.url.includes('viewjob')) {
                req.label = LABELS.DETAIL;
            }
            if (!req.url.includes('&sort=date')) {
                req.url = `${req.url}&sort=date`; // with sort by date there is less duplicates in LISTING
            }
            await requestQueue.addRequest(req as RequestOptions);
            log.info(`This url will be scraped: ${req.url}`);
        }
    } else {
        // IF NO START URL => CREATING FIRST "LIST" PAGE ON OUR OWN
        log.info(`Running site crawl country ${country}, position ${position}, location ${location}`);
        const startUrl = `${countryUrl}/jobs?${position ? `q=${encodeURIComponent(position)}&sort=date` : ''}${location
            ? `&l=${encodeURIComponent(location)}` : ''}`;

        await requestQueue.addRequest({
            url: startUrl,
            label: LABELS.START,
            userData: {
                currentPageNumber: 1,
            },
        });
    }
};
