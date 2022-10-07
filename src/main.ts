import { Actor } from 'apify';
import { log, CheerioCrawler, RequestQueue } from 'crawlee';
import type { ProxyConfigurationOptions } from 'apify';
import type { RequestOptions } from 'crawlee';

import { makeUrlFull, getIdFromUrl, checkMaxItemsInput, buildStartUrl } from './utils.js';
import { LABELS } from './constants.js';

await Actor.init();

interface InputSchema {
    country?: string;
    maxConcurrency?: number;
    position?: string;
    location?: string;
    startUrls?: RequestOptions[],
    extendOutputFunction?: string;
    proxyConfiguration?: ProxyConfigurationOptions;
    saveOnlyUniqueItems?: boolean;
    maxItems?: number;
}

const input: InputSchema = await Actor.getInput() || {};
const {
    country = 'US',
    maxConcurrency,
    position,
    location,
    startUrls = [],
    extendOutputFunction,
    proxyConfiguration = {
        useApifyProxy: true,
    },
    saveOnlyUniqueItems = true,
} = input;

let { maxItems } = input;
maxItems = checkMaxItemsInput(maxItems);
// COUNTER OF ITEMS TO SAVE
let itemsCounter = 0;

// EXTENDED FUNCTION FROM INPUT
let extendOutputFunctionValid;
if (extendOutputFunction) {
    try {
        extendOutputFunctionValid = eval(extendOutputFunction);
    } catch (e) {
        throw new Error(`extendOutputFunction is not a valid JavaScript! Error: ${e}`);
    }
    if (typeof extendOutputFunctionValid !== 'function') {
        throw new Error('extendOutputFunction is not a function! Please fix it or use just default output!');
    }
}

const requestQueue = await RequestQueue.open();
await buildStartUrl({ requestQueue, position, location, country, startUrls });

const sdkProxyConfiguration = await Actor.createProxyConfiguration(proxyConfiguration);
// You must use proxy on the platform
if (Actor.isAtHome() && !sdkProxyConfiguration) {
    throw new Error('You must use Apify Proxy or custom proxies to run this scraper on the platform!');
}

log.info('Starting crawler...');
const crawler = new CheerioCrawler({
    requestQueue,
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 50,
        sessionOptions: {
            maxUsageCount: 50,
        },
    },
    maxConcurrency,
    maxRequestRetries: 10, // a lot of 403 blocks at the beginning of the run
    proxyConfiguration: sdkProxyConfiguration,
    requestHandler: async ({ $, request, session, response }) => {
        log.info(`Label(Page type): ${request.label} || URL: ${request.url}`);

        if (![200, 404].includes(response.statusCode!)) {
            session!.retire();
            request.retryCount--;
            throw new Error(`We got blocked by target on ${request.url}`);
        }

        if ([LABELS.START || LABELS.LIST].includes(request.label!)) {
            const noResultsFlag = $('.no_results').length > 0;

            if (noResultsFlag) {
                log.info('URL doesn\'t have result');
                return;
            }

            let { currentPageNumber } = request.userData;

            const urlDomainBase = (new URL(request.url)).hostname;

            const details: RequestOptions[] = [];
            $('.tapItem a[data-jk]').each((index, element) => {
                const itemId = $(element).attr('data-jk');
                const itemUrl = `https://${urlDomainBase}${$(element).attr('href')}`;
                details.push({
                    url: itemUrl,
                    uniqueKey: saveOnlyUniqueItems ? itemId : `${itemUrl}-${currentPageNumber}`,
                    label: LABELS.DETAIL,
                });
            });

            for (const req of details) {
                // rarely LIST page doesn't load properly (items without href) => check for undefined
                if (!(maxItems && itemsCounter >= maxItems) && itemsCounter < 990 && !req.url.includes('undefined')) {
                    await requestQueue.addRequest(req, { forefront: true });
                }
            }

            // getting total number of items, that the website shows.
            // We need it for additional check. Without it, on the last "list" page it tries to enqueue next (non-existing) list page.
            let maxItemsOnSite;
            // from time to time they return different structure of the element => trying to catch it. If no, retrying.
            try {
                maxItemsOnSite = $('#searchCountPages')
                    .html()!
                    .trim()
                    .split(' ')[3]
                    ? Number($('#searchCountPages')
                        .html()!
                        .trim()
                        .split(' ')[3]
                        .replace(/[^0-9]/g, ''))
                    : Number($('#searchCountPages')
                        .html()!
                        .trim()
                        .split(' ')[0]
                        .replace(/[^0-9]/g, ''));
            } catch (error) {
                await Actor.setValue(`LIST-PAGE-WRONG-LAYOUT-${Math.random()}`, $('html').html(), { contentType: 'text/html' });
                throw new Error('Page didn\'t load properly. Retrying...'); // NOTE: or maybe we can just skip, as we process each LIST page 5 times.
            }

            currentPageNumber++;
            const hasNextPage = $(`a[aria-label="${currentPageNumber}"]`).length > 0;

            if (!(maxItems && itemsCounter > maxItems) && itemsCounter < 990 && itemsCounter < maxItemsOnSite && hasNextPage) {
                const nextPage = $(`a[aria-label="${currentPageNumber}"]`).attr('href')!;
                const urlParsed = new URL(request.url);

                // Indeed has  inconsistent order of items on LIST pages, that is why there are a lot of duplicates. To get all unique items, we enqueue each LIST page 5 times
                for (let i = 0; i < 5; i++) {
                    const nextPageUrl = {
                        url: makeUrlFull(nextPage, urlParsed),
                        uniqueKey: `${i}--${makeUrlFull(nextPage, urlParsed)}`,
                        label: LABELS.LIST,
                        userData: {
                            currentPageNumber,
                        },
                    };
                    await requestQueue.addRequest(nextPageUrl);
                }
            }
        } else if (request.label === LABELS.DETAIL) {
            if (response.statusCode === 404) {
                log.warning(`Got 404 status code. Job offer no longer available. Skipping. | URL: ${request.url}`);
                return;
            } if ($('meta[id="indeed-share-url"]').length === 0) {
                // rarely they return totally different page (possibly direct offer page on company's website)
                log.warning(`Invalid job offer page. Skipping. | URL: ${request.url}`);
                return;
            }

            if (!(maxItems && itemsCounter > maxItems)) {
                let result = {
                    positionName: $('.jobsearch-JobInfoHeader-title').text().trim(),
                    salary: $('#salaryInfoAndJobType .attribute_snippet').text() !== '' ? $('#salaryInfoAndJobType .attribute_snippet').text() : null,
                    company: $('meta[property="og:description"]').attr('content'),
                    location: $('.jobsearch-JobInfoHeader-subtitle > div').eq(1).text(),
                    rating: $('meta[itemprop="ratingValue"]').attr('content') ? Number($('meta[itemprop="ratingValue"]').attr('content')) : null,
                    reviewsCount: $('meta[itemprop="ratingCount"]').attr('content') ? Number($('meta[itemprop="ratingCount"]').attr('content')) : null,
                    url: request.url,
                    id: getIdFromUrl($('meta[id="indeed-share-url"]').attr('content')!),
                    postedAt: $('.jobsearch-JobMetadataFooter>div').not('[class]').text().trim(),
                    scrapedAt: new Date().toISOString(),
                    description: $('div[id="jobDescriptionText"]').text(),
                    externalApplyLink: $('#applyButtonLinkContainer a')[0] ? $($('#applyButtonLinkContainer a')[0]).attr('href') : null,
                };

                if (extendOutputFunction) {
                    try {
                        const userResult = await extendOutputFunctionValid($);
                        result = Object.assign(result, userResult);
                    } catch (e) {
                        log.info('Error in the extendedOutputFunction run', e);
                    }
                }
                await Actor.pushData(result);
                itemsCounter += 1;
            }
        }
    },
});
await crawler.run();
log.info('Done.');
