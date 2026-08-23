# PropertyData API Documentation

This page provides slightly abridged API documentation in markdown format, designed for ingestion by AI assistants and large language models. If you're a human looking for our full interactive documentation, visit [propertydata.co.uk/api/documentation](https://propertydata.co.uk/api/documentation).

---

## Overview

- **Base URL:** https://api.propertydata.co.uk
- **Total Endpoints:** 69
- **Authentication:** API key required (via `key` parameter, `Authorization: Bearer` header, or `X-API-Key` header)
- **Method:** GET requests (POST for /george)
- **Response Format:** JSON
- **CORS:** Enabled (Access-Control-Allow-Origin: *)
- **Rate Limiting:** Varies by plan (typically 50-500 requests per 10 seconds)

## Authentication

Every request requires an API key. You can pass it in one of three ways:

1. Query parameter: `?key=YOUR_API_KEY`
2. Bearer token: `Authorization: Bearer YOUR_API_KEY`
3. Custom header: `X-API-Key: YOUR_API_KEY`

Sign up at [propertydata.co.uk/api/pricing](https://propertydata.co.uk/api/pricing) to get a 14-day free trial.

## Credits & Costs

Every successful API call consumes credits from your monthly plan allowance. Most endpoints cost 1 credit per call; the cost for each endpoint is shown in its section below. Some endpoints charge per results returned (e.g. "1 per 10 results"). Free trials are capped at 500 credits in total.

Check your remaining credits at any time with `/account/credits` (free, 0 credits).

## Response Format

All endpoints return JSON. Successful responses use this envelope:

```json
{"status": "success", ...endpoint-specific fields..., "process_time": "0.45"}
```

Errors return an appropriate HTTP status code and this envelope:

```json
{"status": "error", "code": "X02", "message": "Missing input: key", "process_time": "0.12"}
```

## Error Codes

| Code | HTTP status | Meaning |
|------|-------------|---------|
| X01 | 400 | Invalid API endpoint |
| X02 | 400 | Missing input: key |
| X03 | 422 | Invalid input: key |
| X04 | 403 | Monthly plan or bolt-on credit limit exceeded |
| X05 | 403 | Account cancelled or card declined |
| X06 | 400 | Missing location input (postcode, location or town) |
| X07 | 422 | Invalid input: postcode |
| X07A | 422 | Invalid input: location |
| X07B | 422 | Invalid input: w3w |
| X07C | 422 | Invalid input: town |
| X07D | 400 | Multiple location inputs found (provide exactly one) |
| X07E | 400 | Location input not supported by this endpoint |
| X08 | 404 | Insufficient data found for this location |
| X09 | 500 | Uncaught exception |
| X13 | 403 | Free trial credit limit exceeded |
| X14 | 429 | Rate limit: too many calls in 10 seconds |
| X20 | 503 | Server busy: temporary high load, retry after the Retry-After header (typically 60 seconds); no credits used |

Endpoints may also return endpoint-specific validation codes (e.g. invalid filter values) with a 422 status.

## Location Input Types

Many endpoints accept location inputs. When an endpoint supports location inputs, provide exactly one of the following:

| Parameter | Description | Example |
|-----------|-------------|---------|
| postcode | UK postcode (full, district or sector) | W14 9JH, W14, W14 9 |
| location | Latitude,longitude coordinates | 51.5074,-0.1278 |
| w3w | What3Words address | pretty.needed.chill |
| town | UK town or city name | Manchester |

---

## Endpoints

### /address-match-uprn

Attempt to match an address to it's closest UPRN

**URL:** `https://api.propertydata.co.uk/address-match-uprn`

**Method:** GET

**Credits:** 10 credits

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/address-match-uprn?key={API_KEY}`

### /agents

See local estate agent market share

**URL:** `https://api.propertydata.co.uk/agents`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/agents?key={API_KEY}&postcode=W14+9JH`

### /aonb

Check if a location is within an Area of Outstanding Natural Beauty

**URL:** `https://api.propertydata.co.uk/aonb`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/aonb?key={API_KEY}&postcode=W14+9JH`

### /area-type

Determine the type of area, e.g. rural or urban, in which a postcode resides

**URL:** `https://api.propertydata.co.uk/area-type`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/area-type?key={API_KEY}&postcode=W14+9JH`

### /build-cost

Calculate building costs for construction in a full UK postcode

**URL:** `https://api.propertydata.co.uk/build-cost`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/build-cost?key={API_KEY}&postcode=W14+9JH`

### /buildings

Building data for a title: age, material, use, heights and more

**URL:** `https://api.propertydata.co.uk/buildings`

**Method:** GET

**Credits:** 70 credits

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/buildings?key={API_KEY}`

### /conservation-area

Is postcode within a conservation area

**URL:** `https://api.propertydata.co.uk/conservation-area`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/conservation-area?key={API_KEY}&postcode=W14+9JH`

### /council-tax

Average council tax bills in an area

**URL:** `https://api.propertydata.co.uk/council-tax`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/council-tax?key={API_KEY}&postcode=W14+9JH`

### /crime

See analytics data on local crime

**URL:** `https://api.propertydata.co.uk/crime`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/crime?key={API_KEY}&postcode=W14+9JH`

### /demand

Determine local property sales demand

**URL:** `https://api.propertydata.co.uk/demand`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/demand?key={API_KEY}&postcode=W14+9JH`

### /demand-rent

Determine local property rental demand

**URL:** `https://api.propertydata.co.uk/demand-rent`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/demand-rent?key={API_KEY}&postcode=W14+9JH`

### /demographics

See local population demographics data

**URL:** `https://api.propertydata.co.uk/demographics`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/demographics?key={API_KEY}&postcode=W14+9JH`

### /development-calculator

Calculate how much profit a development will make

**URL:** `https://api.propertydata.co.uk/development-calculator`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/development-calculator?key={API_KEY}&postcode=W14+9JH`

### /development-gdv

Estimate gross development value for a development

**URL:** `https://api.propertydata.co.uk/development-gdv`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/development-gdv?key={API_KEY}&postcode=W14+9JH`

### /energy-efficiency

Find energy efficiency ratings for property within a full UK postcode

**URL:** `https://api.propertydata.co.uk/energy-efficiency`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/energy-efficiency?key={API_KEY}&postcode=W14+9JH`

### /flood-risk

Risk of flooding from rivers/sea for an English postcode

**URL:** `https://api.propertydata.co.uk/flood-risk`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/flood-risk?key={API_KEY}&postcode=W14+9JH`

### /floor-areas

Known internal floor areas for a full UK postcode

**URL:** `https://api.propertydata.co.uk/floor-areas`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/floor-areas?key={API_KEY}&postcode=W14+9JH`

### /freeholds

Local freehold titles with headline info

**URL:** `https://api.propertydata.co.uk/freeholds`

**Method:** GET

**Credits:** 1 per 10 results

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/freeholds?key={API_KEY}&postcode=W14+9JH`

### /george

AI-powered property research assistant

**URL:** `https://api.propertydata.co.uk/george`

**Method:** POST

**Credits:** 10 credits

**Request Body (JSON):**

| Field | Description | Required |
|-------|-------------|----------|
| question | Your question about the UK property market (max 2,000 chars) | Yes |
| conversation | Array of {role, content} message objects for follow-ups (max 50) | No |
| context | Context about the user, e.g. investment goals (max 1,000 chars) | No |

**Authentication:** API key via `X-API-Key` header, `Authorization: Bearer` header, or `?key=` query string

**Example:** `POST https://api.propertydata.co.uk/george` with JSON body `{"question": "What are average house prices in Oxford?"}`

### /green-belt

Is postcode within the green belt

**URL:** `https://api.propertydata.co.uk/green-belt`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/green-belt?key={API_KEY}&postcode=W14+9JH`

### /growth

Up to 7-year capital growth

**URL:** `https://api.propertydata.co.uk/growth`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/growth?key={API_KEY}&postcode=W14+9JH`

### /growth-psf

Up to 7-year growth per square foot

**URL:** `https://api.propertydata.co.uk/growth-psf`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/growth-psf?key={API_KEY}&postcode=W14+9JH`

### /household-income

Get the average household income for an area of interest

**URL:** `https://api.propertydata.co.uk/household-income`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/household-income?key={API_KEY}&postcode=W14+9JH`

### /internet-speed

Internet speeds for a full UK postcode

**URL:** `https://api.propertydata.co.uk/internet-speed`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/internet-speed?key={API_KEY}&postcode=W14+9JH`

### /land-registry-documents

Purchase Land Registry documents, or check their availability

**URL:** `https://api.propertydata.co.uk/land-registry-documents`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/land-registry-documents?key={API_KEY}`

### /lha-rate

The LHA rate for a given postcode / property size

**URL:** `https://api.propertydata.co.uk/lha-rate`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/lha-rate?key={API_KEY}&postcode=W14+9JH`

### /listed-buildings

Local listed buildings

**URL:** `https://api.propertydata.co.uk/listed-buildings`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/listed-buildings?key={API_KEY}&postcode=W14+9JH`

### /mortgage-calculator

Calculate monthly mortgage payments and interest

**URL:** `https://api.propertydata.co.uk/mortgage-calculator`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/mortgage-calculator?key={API_KEY}`

### /mortgage-rates

Average mortgage interest rates

**URL:** `https://api.propertydata.co.uk/mortgage-rates`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/mortgage-rates?key={API_KEY}`

### /national-data

National property market data and economic indicators

**URL:** `https://api.propertydata.co.uk/national-data`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/national-data?key={API_KEY}`

### /national-hmo-register

Search the national register of HMOs

**URL:** `https://api.propertydata.co.uk/national-hmo-register`

**Method:** GET

**Credits:** 1 per 10 results

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/national-hmo-register?key={API_KEY}&postcode=W14+9JH`

### /national-park

Is postcode within a national park

**URL:** `https://api.propertydata.co.uk/national-park`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/national-park?key={API_KEY}&postcode=W14+9JH`

### /plan-analysis

Upload floor plans and receive a detailed, regionalised cost breakdown

**URL:** `https://api.propertydata.co.uk/plan-analysis`

**Method:** POST

**Credits:** 1 credit

**Request Body (JSON):**

| Field | Description | Required |
|-------|-------------|----------|
| question | Your question about the UK property market (max 2,000 chars) | Yes |
| conversation | Array of {role, content} message objects for follow-ups (max 50) | No |
| context | Context about the user, e.g. investment goals (max 1,000 chars) | No |

**Authentication:** API key via `X-API-Key` header, `Authorization: Bearer` header, or `?key=` query string

**Example:** `POST https://api.propertydata.co.uk/plan-analysis` with JSON body `{"question": "What are average house prices in Oxford?"}`

### /planning-applications

Local planning applications

**URL:** `https://api.propertydata.co.uk/planning-applications`

**Method:** GET

**Credits:** 1 per 10 results

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/planning-applications?key={API_KEY}&postcode=W14+9JH`

### /politics

Information about constituency and recent results

**URL:** `https://api.propertydata.co.uk/politics`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/politics?key={API_KEY}&postcode=W14+9JH`

### /population

Get population, household and density information for an area of interest

**URL:** `https://api.propertydata.co.uk/population`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/population?key={API_KEY}&postcode=W14+9JH`

### /postcode-key-stats

Key stats for all postcode districts in a region

**URL:** `https://api.propertydata.co.uk/postcode-key-stats`

**Method:** GET

**Credits:** 30 credits

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/postcode-key-stats?key={API_KEY}`

### /prices

Live local asking prices

**URL:** `https://api.propertydata.co.uk/prices`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/prices?key={API_KEY}&postcode=W14+9JH`

### /prices-per-sqf

Live local asking £/sqft

**URL:** `https://api.propertydata.co.uk/prices-per-sqf`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/prices-per-sqf?key={API_KEY}&postcode=W14+9JH`

### /property-types

ONS breakdown of local property stock by type

**URL:** `https://api.propertydata.co.uk/property-types`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/property-types?key={API_KEY}&postcode=W14+9JH`

### /ptal

PTAL score for a Greater London postcode

**URL:** `https://api.propertydata.co.uk/ptal`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/ptal?key={API_KEY}&postcode=W14+9JH`

### /rebuild-cost

Estimate the approximate rebuild cost of a house

**URL:** `https://api.propertydata.co.uk/rebuild-cost`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/rebuild-cost?key={API_KEY}&postcode=W14+9JH`

### /rents

Live local long-let asking rents

**URL:** `https://api.propertydata.co.uk/rents`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/rents?key={API_KEY}&postcode=W14+9JH`

### /rents-commercial

Commercial property quoting rents

**URL:** `https://api.propertydata.co.uk/rents-commercial`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/rents-commercial?key={API_KEY}&postcode=W14+9JH`

### /rents-hmo

Live local HMO asking rents

**URL:** `https://api.propertydata.co.uk/rents-hmo`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/rents-hmo?key={API_KEY}&postcode=W14+9JH`

### /restaurants

Nearby restaurants

**URL:** `https://api.propertydata.co.uk/restaurants`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/restaurants?key={API_KEY}&postcode=W14+9JH`

### /schools

Nearby schools

**URL:** `https://api.propertydata.co.uk/schools`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/schools?key={API_KEY}&postcode=W14+9JH`

### /site-plan-documents

Purchase an A4 scale site plan which can be used for planning applications

**URL:** `https://api.propertydata.co.uk/site-plan-documents`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/site-plan-documents?key={API_KEY}`

### /sold-prices

Local property sold prices

**URL:** `https://api.propertydata.co.uk/sold-prices`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/sold-prices?key={API_KEY}&postcode=W14+9JH`

### /sold-prices-per-sqf

Local property sold £/sqft

**URL:** `https://api.propertydata.co.uk/sold-prices-per-sqf`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/sold-prices-per-sqf?key={API_KEY}&postcode=W14+9JH`

### /sourced-properties

Properties from a sourcing list

**URL:** `https://api.propertydata.co.uk/sourced-properties`

**Method:** GET

**Credits:** 1 per 10 results

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/sourced-properties?key={API_KEY}&postcode=W14+9JH`

### /sourced-property

Information relating to a specific sourced property

**URL:** `https://api.propertydata.co.uk/sourced-property`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/sourced-property?key={API_KEY}`

### /stamp-duty-calculator

SDLT payable on a property transaction

**URL:** `https://api.propertydata.co.uk/stamp-duty-calculator`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/stamp-duty-calculator?key={API_KEY}`

### /tenure-types

ONS breakdown of local property stock by tenure

**URL:** `https://api.propertydata.co.uk/tenure-types`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/tenure-types?key={API_KEY}&postcode=W14+9JH`

### /title

Address, type, ownership and lease information by title number

**URL:** `https://api.propertydata.co.uk/title`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/title?key={API_KEY}`

### /title-use-class

Predicted planning use class

**URL:** `https://api.propertydata.co.uk/title-use-class`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/title-use-class?key={API_KEY}`

### /titles-by-company

Search land titles by company ownership

**URL:** `https://api.propertydata.co.uk/titles-by-company`

**Method:** GET

**Credits:** 1 per 50 results

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/titles-by-company?key={API_KEY}`

### /uprn

Property information from Unique Property Reference Number

**URL:** `https://api.propertydata.co.uk/uprn`

**Method:** GET

**Credits:** 10 credits

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/uprn?key={API_KEY}`

### /uprn-title

Lookup a title number from a UPRN

**URL:** `https://api.propertydata.co.uk/uprn-title`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/uprn-title?key={API_KEY}`

### /uprns

Find UPRNs in a given postcode area

**URL:** `https://api.propertydata.co.uk/uprns`

**Method:** GET

**Credits:** 1 per 10 results

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |

**Example:** `https://api.propertydata.co.uk/uprns?key={API_KEY}&postcode=W14+9JH`

### /valuation-commercial-rent

Rental valuation for a commercial property

**URL:** `https://api.propertydata.co.uk/valuation-commercial-rent`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/valuation-commercial-rent?key={API_KEY}&postcode=W14+9JH`

### /valuation-commercial-sale

Sale valuation for a commercial property

**URL:** `https://api.propertydata.co.uk/valuation-commercial-sale`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/valuation-commercial-sale?key={API_KEY}&postcode=W14+9JH`

### /valuation-historical

Estimate the value of a property on a date in the past

**URL:** `https://api.propertydata.co.uk/valuation-historical`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/valuation-historical?key={API_KEY}&postcode=W14+9JH`

### /valuation-hmo

Sale and gross rental valuations for an HMO

**URL:** `https://api.propertydata.co.uk/valuation-hmo`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/valuation-hmo?key={API_KEY}&postcode=W14+9JH`

### /valuation-rent

Rental valuation for a property

**URL:** `https://api.propertydata.co.uk/valuation-rent`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/valuation-rent?key={API_KEY}&postcode=W14+9JH`

### /valuation-sale

Sale valuation for a property

**URL:** `https://api.propertydata.co.uk/valuation-sale`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |

**Example:** `https://api.propertydata.co.uk/valuation-sale?key={API_KEY}&postcode=W14+9JH`

### /yields

Determine local rental yields

**URL:** `https://api.propertydata.co.uk/yields`

**Method:** GET

**Credits:** 1 credit

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |
| postcode | UK postcode | One location input required |
| location | Latitude,longitude coordinates | |
| w3w | What3Words address | |
| town | UK town or city name | |

**Example:** `https://api.propertydata.co.uk/yields?key={API_KEY}&postcode=W14+9JH`

### /account/credits

Information about your API account; credits used, credits remaining etc

**URL:** `https://api.propertydata.co.uk/account/credits`

**Method:** GET

**Credits:** Free

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/account/credits?key={API_KEY}`

### /account/documents

Summary of your previous document purchases, with download links where available

**URL:** `https://api.propertydata.co.uk/account/documents`

**Method:** GET

**Credits:** Free

**Parameters:**

| Parameter | Description | Required |
|-----------|-------------|----------|
| key | Your API key | Yes |

**Example:** `https://api.propertydata.co.uk/account/documents?key={API_KEY}`

---

Generated: 2026-08-18 11:34:47 | 69 endpoints | [propertydata.co.uk](https://propertydata.co.uk)
