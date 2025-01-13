# Modus AI Agents with Knowledge Graphs | Recipe Project

## Introduction

This project is designed to manage recipes, meal plans, and user preferences, leveraging a Neo4j database and the Modus Framework to create a robust and flexible backend. It enables functionalities such as recipe discovery, personalized recommendations, shopping list generation, and meal planning. By integrating advanced knowledge graph use cases and LLMs, the project demonstrates seamless interaction between structured data and AI-driven recommendations.

The dataset for this project can be found in the `dataset` folder, along with a Python notebook to facilitate data import into Neo4j. This submission was tailored for the Hypermode Hackathon to showcase how knowledge graphs can enhance AI applications.

## Project Demo

### Preview

Include a preview image or architecture diagram of the project here. Add the following markdown to link an image:

![Project Preview](/assets/graphql.png)

## Installation

### Prerequisites

- Node.js and npm installed on your machine
- Modus CLI installed globally
- Access to a Neo4j database instance with your Knowledge Graph
- An OpenAI API key for LLM integration

### Steps to Install

1. **Install the Modus CLI**
   Install the Modus CLI using npm:

   ```bash
   npm install -g @hypermode/modus-cli
   ```

2. **Clone Repository**
   Clone the repository:

   ```bash
   git https://github.com/fabischkamau/flavour-fiesta-api.git
   ```

3. **Install Packages**
   Navigate to the project folder and install dependencies:

   ```bash
   npm install
   ```

4. **Import Dataset**
   Import the dataset provided in the `dataset` folder. Use the Python notebook included in the folder to load the data into your Neo4j database. Ensure your Neo4j instance is running and properly configured.

5. **Configure the Project Connection and Models**
   Replace the content of `modus.json` in your project directory with the following configuration:
   Add a `.env` file and paste your Neo4j password and API keys.

   ```bash
   MODUS_NEO4JSANDBOX_NEO4J_PASSWORD=
   MODUS_OPENAI_API_KEY=
   ```

   ```json
   {
     "$schema": "https://schema.hypermode.com/modus.json",
     "endpoints": {
       "default": {
         "type": "graphql",
         "path": "/graphql",
         "auth": "bearer-token"
       }
     },
     "models": {
       "llm": {
         "sourceModel": "gpt-4o-mini",
         "connection": "openai",
         "path": "v1/chat/completions"
       }
     },
     "connections": {
       "neo4jsandbox": {
         "type": "neo4j",
         "dbUri": "your bolt connection",
         "username": "neo4j",
         "password": "{{NEO4J_PASSWORD}}"
       },
       "openai": {
         "type": "http",
         "baseUrl": "https://api.openai.com/",
         "headers": {
           "Authorization": "Bearer {{API_KEY}}"
         }
       }
     }
   }
   ```

6. **Build and Run the App**
   Navigate to the app directory and run the following command to start the app in development mode:
   ```bash
   modus dev
   ```
   Access the local endpoint at `http://localhost:8686/explorer` to interact with the API.

## Dataset Dump request

You can request the neo4j dump dataset!

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.

---

Feel free to reach out if you have questions or need support.

