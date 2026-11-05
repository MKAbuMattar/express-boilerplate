import {injectable} from 'inversify';

// Spring-style stereotypes. All are singleton beans picked up by autobind.
export const Component = injectable;
export const Service = injectable;
export const Repository = injectable;
