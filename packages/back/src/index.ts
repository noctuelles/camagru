import http from 'node:http';
import { StatusCodes } from 'http-status-codes';

export type Test = string;

http
  .createServer((request, response) => {
    console.log(request.headers);
    response.statusCode = StatusCodes.OK;
    response.write('Hello world');
    response.end();
  })
  .listen(8081);
