/*
 *   Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License").
 *   You may not use this file except in compliance with the License.
 *   A copy of the License is located at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   or in the "license" file accompanying this file. This file is distributed
 *   on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *   express or implied. See the License for the specific language governing
 *   permissions and limitations under the License.
 */

import { IRouter, CoreSetup, IClusterClient, Logger, SessionStorageFactory } from 'kibana/server';
import { AuthType } from '../../common';
import { OpenIdAuthentication } from './types/openid/openid_auth';
import { SecuritySessionCookie } from '../session/security_cookie';
import { BasicAuthentication } from './types/basic/basic_auth';
import { IAuthenticationType, IAuthHandlerConstructor } from './types/authentication_type';
import { SamlAuthentication } from './types/saml/saml_auth';
import { ProxyAuthentication } from './types/proxy/proxy_auth';
import { JwtAuthentication } from './types/jwt/jwt_auth';
import { SecurityPluginConfigType } from '..';

export function createAuthentication(
  ctor: IAuthHandlerConstructor,
  config: SecurityPluginConfigType,
  sessionStorageFactory: SessionStorageFactory<SecuritySessionCookie>,
  router: IRouter,
  esClient: IClusterClient,
  coreSetup: CoreSetup,
  logger: Logger
): IAuthenticationType {
  return new ctor(config, sessionStorageFactory, router, esClient, coreSetup, logger);
}

export function getAuthenticationHandler(
  authType: string,
  router: IRouter,
  config: SecurityPluginConfigType,
  core: CoreSetup,
  esClient: IClusterClient,
  securitySessionStorageFactory: SessionStorageFactory<SecuritySessionCookie>,
  logger: Logger
): IAuthenticationType {
  let authHandlerType: IAuthHandlerConstructor;
  switch (authType) {
    case '':
    case 'basicauth':
      authHandlerType = BasicAuthentication;
      break;
    case AuthType.JWT:
      authHandlerType = JwtAuthentication;
      break;
    case AuthType.OPEN_ID:
      authHandlerType = OpenIdAuthentication;
      break;
    case AuthType.SAML:
      authHandlerType = SamlAuthentication;
      break;
    case AuthType.PROXY:
      authHandlerType = ProxyAuthentication;
      break;
    default:
      throw new Error(`Unsupported authentication type: ${authType}`);
  }
  const auth: IAuthenticationType = createAuthentication(
    authHandlerType,
    config,
    securitySessionStorageFactory,
    router,
    esClient,
    esClient,
    logger
  );
  return auth;
}
