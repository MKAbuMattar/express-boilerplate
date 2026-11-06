import {injectable} from 'inversify';

// Stereotypes: name the role of a class. All are singleton beans picked up by autobind.
export const Component = injectable;
export const Service = injectable;
export const Repository = injectable;
