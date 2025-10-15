# @promptware/guider

This library helps with building LLM chatbots that execute actions. It provides a simple and opinionated interface to glue chatbots with existing DBs/APIs.

## What problems does it solve?

LLM tools with structured inputs are a great way to dispatch data to handler functions, but when it comes to UX for human-facing chatbots, LLM tools lack many features, because the magic happening between a user input and a dispatch can only be controlled by prompting.

Consider the following problems:

- The parameters provided by the user may not make sense within the app domain, while satisfying the schema
- Parameters are inter-dependent: some values only make sense in the presence of others, etc
- If a tool call leads to an error, some parameter values may have to be reconsidered by the user

## Concepts

- **Flows** are like tools extended: they are executable functions that are decorated with some info on how to query a user to provide the arguments via a chat interface
- **Agents** are TypeScript classes containing multiple flows (decorated methods).
