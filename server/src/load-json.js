// @flow
/* eslint-disable no-await-in-loop */

const fs = require('fs');
const got = require('got');

const URL_PREFIX = 'http://localhost:3001/';

function deleteAll(urlSuffix) {
  const url = URL_PREFIX + urlSuffix;
  return got.delete(url);
}

async function getEnumId(enumName) {
  const url = URL_PREFIX + 'types/enums';
  const {body} = await got.get(url);
  const enums = JSON.parse(body);
  const anEnum = enums.find(anEnum => anEnum.name === enumName);
  return anEnum ? anEnum.id : 0;
}

async function getTypeId(typeName) {
  const url = URL_PREFIX + 'type';
  const {body} = await got.get(url);
  const types = JSON.parse(body);
  const type = types.find(type => type.name === typeName);
  return type ? type.id : 0;
}

async function loadEnum(name, valueMap) {
  const res = await post('enum', {name});
  const enumId = res.body;
  const valueNames = Object.keys(valueMap);
  const promises = valueNames.map(name => {
    const value = Number(valueMap[name]);
    return post('enum_member', {enumId, name, value});
  });
  await Promise.all(promises);
}

async function loadInstance(parentId, name, typeDescriptor) {
  if (typeof typeDescriptor === 'string') {
    const typeId = await getTypeId(typeDescriptor);
    await post('instance', {name, parentId, typeId});
  } else if (typeof typeDescriptor === 'object') {
    const {children, type} = typeDescriptor;
    const typeId = await getTypeId(type);
    const {body: id} = await post('instance', {name, parentId, typeId});

    const childNames = Object.keys(children);
    for (const name of childNames) {
      await loadInstance(id, name, children[name]);
    }
  } else {
    throw new Error('invalid instance type: ' + typeDescriptor);
  }
}

async function loadType(parentId, name, valueMap) {
  const keys = Object.keys(valueMap);
  const propertyNames = keys.filter(key => {
    const value = valueMap[key];
    return typeof value === 'string';
  });
  const childNames = keys.filter(key => {
    const value = valueMap[key];
    return typeof value === 'object';
  });

  const res = await post('type', {name, parentId});
  const typeId = res.body;

  for (const name of propertyNames) {
    const kind = valueMap[name];
    const data = {enumId: null, typeId, name, kind};

    const enumId = await getEnumId(kind);
    if (enumId) data.enumId = enumId;
    await post('type_data', data);
  }

  for (const name of childNames) {
    const childType = valueMap[name];
    await loadType(typeId, name, childType);
  }
}

function post(urlSuffix, body) {
  const url = URL_PREFIX + urlSuffix;
  const options = {body, json: true};
  return got.post(url, options);
}

async function processFile(jsonPath) {
  const json = fs.readFileSync(jsonPath, {encoding: 'utf8'});
  const {enums, instances, types} = JSON.parse(json);

  // Clear the tables that will be loaded.
  // enum_member, instance_data, and type_data
  // are cleared through cascading deletes.
  await deleteAll('enum');
  await deleteAll('instance');
  await deleteAll('type');

  try {
    // Load enums.
    const enumNames = Object.keys(enums);
    for (const name of enumNames) {
      await loadEnum(name, enums[name]);
    }

    // Load types.
    // Add type root node.
    const {body: typeRootId} = await post('type', {name: 'root'});
    const typeNames = Object.keys(types);
    for (const name of typeNames) {
      await loadType(typeRootId, name, types[name]);
    }

    // Load instances.
    // Add instance root node.
    const {body: instanceRootId} = await post('instance', {name: 'root'});
    const instanceNames = Object.keys(instances);
    for (const name of instanceNames) {
      await loadInstance(instanceRootId, name, instances[name]);
    }
  } catch (e) {
    console.error(e);
  }
}

const [, , jsonPath] = process.argv;
processFile(jsonPath);
