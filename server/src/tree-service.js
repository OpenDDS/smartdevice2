// @flow

import {getDbConnection} from './database';
import {errorHandler} from './util/error-util';

//const inTest = process.env.NODE_ENV === 'test';

const NOT_FOUND = 404;
const OK = 200;

let mySql;

async function deleteByIdHandler(
  req: express$Request,
  res: express$Response
): Promise<void> {
  const {id, kind} = req.params;
  try {
    // Cascading deletes in database take care of
    // deleting all descendant types.
    const {affectedRows} = await mySql.deleteById(kind, id);
    res.send(String(affectedRows));
  } catch (e) {
    // istanbul ignore next
    errorHandler(res, e);
  }
}

async function createHandler(
  req: express$Request,
  res: express$Response
): Promise<void> {
  const {kind} = req.params;
  try {
    const obj = JSON.parse(req.body);
    const rows = await mySql.insert(kind, obj);
    res.send(JSON.stringify(rows));
  } catch (e) {
    // istanbul ignore next
    errorHandler(res, e);
  }
}

async function getAllHandler(
  req: express$Request,
  res: express$Response
): Promise<void> {
  const {kind} = req.params;
  try {
    const rows = await mySql.getAll(kind);
    res.send(JSON.stringify(rows));
  } catch (e) {
    // istanbul ignore next
    errorHandler(res, e);
  }
}

async function getByIdHandler(
  req: express$Request,
  res: express$Response
): Promise<void> {
  const {id, kind} = req.params;
  try {
    const type = await mySql.getById(kind, id);
    res.status(type ? OK : NOT_FOUND).send(JSON.stringify(type));
  } catch (e) {
    // istanbul ignore next
    errorHandler(res, e);
  }
}

async function patchHandler(
  req: express$Request,
  res: express$Response
): Promise<void> {
  const {id, kind} = req.params;
  const changes = req.body;
  try {
    const type = await mySql.getById(kind, id);
    const newType = {...type, ...changes};
    await mySql.updateById(kind, id, newType);
    res.status(OK).send(JSON.stringify(newType));
  } catch (e) {
    // istanbul ignore next
    errorHandler(res, e);
  }
}

function treeService(app: express$Application): void {
  mySql = getDbConnection();

  const URL_PREFIX = '/tree/:kind';
  app.delete(URL_PREFIX + '/:id', deleteByIdHandler);
  app.get(URL_PREFIX, getAllHandler);
  app.get(URL_PREFIX + '/:id', getByIdHandler);
  app.patch(URL_PREFIX + '/:id', patchHandler);
  app.post(URL_PREFIX, createHandler);
}

module.exports = {
  createHandler,
  deleteByIdHandler,
  getAllHandler,
  getByIdHandler,
  patchHandler,
  treeService
};
