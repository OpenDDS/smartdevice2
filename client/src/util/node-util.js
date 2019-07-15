// @flow

import {getState} from 'redux-easy';

import type {NodeType} from '../types';
import {getJson} from '../util/rest-util';

export function getInstanceNode(instanceId: number): NodeType {
  const {instanceNodeMap} = getState();
  return instanceNodeMap[instanceId];
}

export function getTypeNode(instanceNode: NodeType): NodeType {
  const {typeNodeMap} = getState();
  return typeNodeMap[instanceNode.typeId];
}

export function getPropType(property) {
  const {
    ui: {typeProps}
  } = getState();
  const typeDef = typeProps.find(prop => prop.name === property);
  return typeDef ? typeDef.kind : 'number';
}

export function getInstanceData() {
  const {instanceData} = getState();
  return instanceData;
}

export async function loadTypeNode(instanceNode: NodeType): Promise<?NodeType> {
  if (!instanceNode) return null;

  const {typeId} = instanceNode;
  if (!typeId) {
    throw new Error(`instance ${instanceNode.name} has no type id`);
  }

  const typeNode = getTypeNode(instanceNode);
  if (typeNode) return typeNode;

  const json = await getJson(`type/${typeId}`);
  return ((json: any): Promise<NodeType>);
}
