### Indeed Scraper

Indeed Scraper is an [Apify actor](https://apify.com/actors) for extracting data about work positions from [Indeed.com](https://www.indeed.com/). It allows you to extract information about all positions on this website. It is build on top of [Apify SDK](https://sdk.apify.com/) and you can run it both on [Apify platform](https://my.apify.com) and locally.

- [Input](#input)
- [Output](#output)
- [Compute units consumption](#compute-units-consumption)
- [Extend output function](#extend-output-function)

### Input

| Field | Type | Description | Default value
| ----- | ---- | ----------- | -------------|
| country | string | Country where the positions will be searched for, if none then general indeed site is used. In JSON standard country two letter abbreveiation is used instead, for example 'cz' or 'uk' | none |
| position | string | Any string pattern for position name or company | none |
| location | string | Any string pattern for location city or area | none |
| startUrls | array | List of [Request](https://sdk.apify.com/docs/api/request#docsNav) objects that will be deeply crawled. The URL can be top level like `https://cz.indeed.com/jobs?q=javascript+developer&l=prague`, any category/search URL or detail URL | `[{ "url": "https://cz.indeed.com/jobs?q=javascript+developer&l=prague" }]`|
| maxItems | number | Maximum number of actor pages that will be scraped | all found |
| extendOutputFunction | string | Function that takes a JQuery handle ($) as argument and returns data that will be merged with the default output. More information in [Extend output function](#extend-output-function) | |
| proxyConfiguration | object | Proxy settings of the run. Use Apify proxy (default settings), or use your own proxy. The actor cannot be run without proxy. | `{ "useApifyProxy": true }`|

### Output

Output is stored in a dataset. Each item is an information about a movies/TV show. Example:

```
{
  "positionName": "Sr. Android Developer (Independent Candidates only not with employers)",
  "company": "Innovyt",
  "location": "San Francisco, CA",
  "rating": "3.4",
  "reviewsCount": "233",
  "url": "https://www.indeed.com/company/Innovyt/jobs/Senior-Android-Developer-ee6f2dbfb12dcca7?fccid=ffabf8962cbfb083&vjs=3",
  "id": "ee6f2dbfb12dcca7",
  "postedAt": "6 days ago",
  "scrapedAt": "2022-01-12T13:54:16.024Z",
  "description": "Role: Sr. Android Developer Locations: NY / NJ / Freemont, CA/San Leandro, CA/San Francisco, CA / Charlotte, NC / Minneapolis, Minnesota / Chandler, Arizona Overall 7+ years of Software development experience5+ years of overall Android development experienceFin Tech / Banking experience nice to have but not mandatedCandidate should be able to demonstrate example of apps in Google PlayStore3+ years of experience on native dev preferably in KotlinExperience with Reactive Programming (RxJava), Dependency Injection (Dagger), Retrofit and KotlinTechnical degree or additional experienceExcellent communication skillsJob Types: Full-time, ContractPay: $75.00 - $80.00 per hourSchedule:8 hour shiftEducation:Bachelor's (Preferred)Experience:iOS: 1 year (Preferred)SDKs: 1 year (Required)Android: 1 year (Required)Work Location: One location"
}
```
### NOTE: Bug with LIST (PAGINATION) pages
Indeed.com has  inconsistent (random) order of items on LIST pages, that is why there might be duplicated items (job offers) in the list. To deal with it and to get all unique items, we process each LIST page (URL) 5 times.

### Changelog

This scraper is under active development. We are always implementing new features and fixing bugs. If you would like to see a new feature, please submit an issue on GitHub. Check [CHANGELOG.md](https://github.com/metalwarrior665/actor-indeed-scraper/blob/master/CHANGELOG.md) for a list of recent updates.

### Compute units consumption

Keep in mind that it is much more efficient to run one longer scrape (at least one minute) than more shorter ones because of the startup time.

The average consumption is **1 Compute unit for 1000 actor pages** scraped.

### Extend output function

You can use this function to update the default output of this actor. This function gets a JQuery handle `$` as an argument so you can choose what data from the page you want to scrape. The output from this will function will get merged with the default output.

The return value of this function has to be an object!

You can return fields to achive 3 different things:
- Add a new field - Return object with a field that is not in the default output
- Change a field - Return an existing field with a new value
- Remove a field - Return an existing field with a value `undefined`


```
($) => {
    return {
        "jobType": $('span[class="jobsearch-JobMetadataHeader-iconLabel"]').eq(1).text().trim(),
        url: undefined
    }
}
```
This example will add a new field `jobType` and remove `url` field
```
{
  "positionName": "SharePoint Developer",
  "id": "6f524b31f5df1cad",
  "location": "Praha",
  "jobType":"Plný úvazek, Trvalý",
  "description": "Job Description\nJoin us in the digital health revolution and tackle biggest opportunities and challenges at the intersection of healthcare, information and technology. Become a member of our development team in the heart of Prague with startup atmosphere and flat, friendly and collaborative environment. Enjoy a reward that technology careers don’t often bring: the satisfaction of helping to save lives.\nAs a SharePoint Web Developer, you will:\nDesign UI components and layout of SharePoint Online site (Office 365)\nExtend the SharePoint online capabilities by developing custom components (SPFx)\nIntegrate SharePoint Online with non-SharePoint application by designing the data models and providing APIs\nLeverage the whole Office 365 ecosystem to deliver enterprise business solutions\nCooperate with Product owners, UX, Developers and other stakeholders on definition of the technical solution approach based on business requirements\nCooperate with other development teams with variety of competencies (JS, mobile / Swift, API, etc.)\nYou will experience:\nDiscovering opportunities to create significant value through digital technology in health care\nWorking with teams that are excited for what they do\nBuilding modern and quality applications within complex enterprise environment\nYou surely already know:\nSharePoint On-Premises, SharePoint Online (Office 365) SPFx development\nFront-End Web development (JavaScript / TypeScript, React, HTML, CSS)\nTest Driven Development and Agile practices\nSharePoint and Office 365 integrations (REST API, Graph API)\nMaybe you also heard of:\nCloud technologies (Azure, Amazon Web Services)\nJavaScript - React.js, Office Fabric UI, TypeScript/ES6+\nSharePoint or Office Add-ins, SharePoint Framework, SharePoint Design Manager\nDevelopment with and usage of other O365 components (LogicApps, Flow, PowerApps, Teams, etc.)\nExperience with Application Development Life-Cycle\nSearch Firm Representatives Please Read Carefully\nMerck & Co., Inc., Kenilworth, NJ, USA, also known as Merck Sharp & Dohme Corp., Kenilworth, NJ, USA, does not accept unsolicited assistance from search firms for employment opportunities. All CVs / resumes submitted by search firms to any employee at our company without a valid written search agreement in place for this position will be deemed the sole property of our company. No fee will be paid in the event a candidate is hired by our company as a result of an agency referral where no pre-existing agreement is in place. Where agency agreements are in place, introductions are position specific. Please, no phone calls or emails.\nEmployee Status:\nRegular\nRelocation:\nNo relocation\nVISA Sponsorship:\nTravel Requirements:\nFlexible Work Arrangements:\nShift:\nValid Driving License:\nHazardous Material(s):\nNumber of Openings:\n1\nRequisition ID:R18002"
}
```
