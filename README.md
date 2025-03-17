# salesforce-brain-commerce: Storefront Reference Architecture (SFRA)

This is the repository for the int_brain_commerce integration. This integration enhances the app\_storefront\_base cartridge by providing product data including the following capabilities:

* Shoppers can search for different products in the chat widget where they can get real-time product information  (name, price, availability, etc..).
* Allows customers to search and explore products directly within the chat interface.
* Provides personalized product recommendations based on user queries.

# Cartridge Path Considerations
The int_brain_commerce integration cartridge requires the app\_storefront\_base cartridge. In your cartridge path, include the cartridges in the following order:

```
int_brain_commerce:app_storefront_base
```

# Getting Started

1. Clone this repository. (The name of the top-level folder is int_brain_commerce.)
2. In the top-level int_brain_commerce folder, enter the following command: `npm install`. (This command installs all of the package dependencies required for this integration.)
3. In the top-level int_brain_commerce folder, edit the paths.base property in the package.json file. This property should contain a relative path to the local directory containing the Storefront Reference Architecture repository. For example:
```
"paths": {
    "base": "../storefront-reference-architecture/cartridges/app_storefront_base/"
  }
```
4. In the top-level int_brain_commerce folder, enter the following command: `npm run compile:js` this command is used to compile the js files.
```

# NPM Scripts

* Use the provided NPM scripts to compile and upload changes to your Sandbox.

* npm run compile:js - Compiles all js files and aggregates them.

## Lint Your Code

* npm run lint - Execute linting for all JavaScript and SCSS files in the project. You should run this command before committing your code.

## Watch for Changes and Uploading

* npm run watch - Watches everything and recompiles (if necessary) and uploads to the sandbox. Requires a valid dw.json file at the root that is configured for the sandbox to upload.

## Run Unit Tests

* You can run npm run test to execute all unit tests in the project. Run npm run cover to get coverage information. Coverage will be available in coverage folder under root directory.

To run unit tests, use the following command:

```
npm run test
```

## Run Integration Tests

* This cartridge's Integration tests are located in ./test/integration

To run integration tests, use the following command:

```
npm run test:integration
```